/**
 * Analysis pipeline, service-worker side (PLAN 4.5, FR3–FR6, FR12).
 *
 * On each navigation to analyse: record a fresh `pending` tab state with a new navigation
 * token, then (unless switched off or trusted) inject the content script. The content script
 * extracts the features from the live DOM once the page has settled and sends them back with
 * the token. A result whose token is no longer the tab's latest is discarded as stale.
 * Inference runs here with the bundled model; the verdict is stored in the tab state.
 *
 * All work for one tab is serialised, so a slow result can never overwrite a newer navigation.
 */
import type { FeatureVector } from '@phisheck/shared/features';
import type { Model } from '@phisheck/shared/model-runtime';
import { isTrusted } from '../common/allowlist.js';
import { fromWire, type FeaturesMessage, type VerdictResponse } from '../common/messages.js';
import type { Settings } from '../common/settings.js';
import type { TabState } from '../common/tab-state.js';
import type { NavigationDecision } from './navigation.js';

export interface AnalyserDeps {
  getSettings: () => Promise<Settings>;
  getTabState: (tabId: number) => Promise<TabState | undefined>;
  setTabState: (tabId: number, state: TabState) => Promise<void>;
  clearTabState: (tabId: number) => Promise<void>;
  /** Injects the content script into the tab's main frame, tagged with the token. */
  inject: (tabId: number, navigationId: string) => Promise<void>;
  model: () => Model;
  predict: (model: Model, vector: FeatureVector) => number;
  newId: () => string;
  now: () => number;
  /** Adds the exact URL to the trusted URLs (FR8). */
  trustUrl: (url: string) => Promise<unknown>;
  /** Removes a banner still shown by the tab's document (SPA navigations). */
  hideBanner?: (tabId: number) => Promise<void>;
  /** Called after every tab-state change (badge, popup: PLAN 4.6, 4.9). */
  onStateChange?: (tabId: number, state: TabState | undefined) => Promise<void> | void;
}

export class Analyser {
  private readonly locks = new Map<number, Promise<unknown>>();

  constructor(private readonly deps: AnalyserDeps) {}

  /** Runs `task` after every earlier task of the same tab has finished. */
  private serialise<T>(tabId: number, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(tabId) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    this.locks.set(tabId, settled);
    void settled.then(() => {
      if (this.locks.get(tabId) === settled) this.locks.delete(tabId);
    });
    return run;
  }

  private async store(tabId: number, state: TabState | undefined): Promise<void> {
    if (state === undefined) await this.deps.clearTabState(tabId);
    else await this.deps.setTabState(tabId, state);
    await this.deps.onStateChange?.(tabId, state);
  }

  handleNavigation(decision: NavigationDecision): Promise<void> {
    if (decision.action === 'ignore') return Promise.resolve();
    const { tabId } = decision;
    if (decision.action === 'clear')
      return this.serialise(tabId, () => this.store(tabId, undefined));

    const { url } = decision;
    return this.serialise(tabId, async () => {
      // A full navigation replaces the document (and its banner); an SPA one keeps it.
      if (decision.reason === 'spa') await this.deps.hideBanner?.(tabId);
      const navigationId = this.deps.newId();
      const settings = await this.deps.getSettings();
      if (!settings.enabled) {
        return this.store(tabId, { status: 'skipped', url, navigationId, reason: 'disabled' });
      }
      if (isTrusted(url, settings)) {
        return this.store(tabId, { status: 'skipped', url, navigationId, reason: 'trusted' });
      }
      await this.store(tabId, { status: 'pending', url, navigationId, startedAt: this.deps.now() });
      try {
        await this.deps.inject(tabId, navigationId);
      } catch (error) {
        // E.g. the tab shows a browser error page or was closed: nothing to analyse.
        const current = await this.deps.getTabState(tabId);
        if (current?.navigationId === navigationId) {
          await this.store(tabId, { status: 'error', url, navigationId, message: String(error) });
        }
      }
    });
  }

  /** Features from the content script of `tabId`'s main frame. */
  handleFeatures(tabId: number, message: FeaturesMessage): Promise<VerdictResponse> {
    return this.serialise(tabId, async (): Promise<VerdictResponse> => {
      const state = await this.deps.getTabState(tabId);
      if (state?.status !== 'pending' || state.navigationId !== message.navigationId) {
        return { status: 'stale' };
      }
      const { navigationId } = state;
      const url = message.url;
      // Settings may have changed while the page loaded: honour them now.
      const settings = await this.deps.getSettings();
      if (!settings.enabled || isTrusted(url, settings)) {
        const reason = settings.enabled ? 'trusted' : 'disabled';
        await this.store(tabId, { status: 'skipped', url, navigationId, reason });
        return { status: 'skipped', reason };
      }
      try {
        const model = this.deps.model();
        const vector = fromWire(message.vector, model.featureNames.length);
        const probability = this.deps.predict(model, vector);
        const flagged = probability >= settings.threshold;
        await this.store(tabId, {
          status: 'done',
          url,
          navigationId,
          probability,
          threshold: settings.threshold,
          flagged,
          analysedAt: this.deps.now(),
          ...(message.domError === undefined ? {} : { domError: message.domError }),
        });
        return { status: 'done', flagged, probability, threshold: settings.threshold };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await this.store(tabId, { status: 'error', url, navigationId, message: text });
        return { status: 'error', message: text };
      }
    });
  }

  /**
   * Trust this URL (FR8), from the banner or the popup of `tabId`. The tab's verdict becomes
   * "skipped: trusted" right away, which clears its badge and popup.
   */
  handleTrust(tabId: number, url: string): Promise<boolean> {
    return this.serialise(tabId, async () => {
      try {
        await this.deps.trustUrl(url);
      } catch {
        return false;
      }
      const state = await this.deps.getTabState(tabId);
      if (state !== undefined && isTrusted(state.url, await this.deps.getSettings())) {
        const { url: stateUrl, navigationId } = state;
        await this.store(tabId, {
          status: 'skipped',
          url: stateUrl,
          navigationId,
          reason: 'trusted',
        });
        await this.deps.hideBanner?.(tabId); // trusted from the popup: the banner goes too
      }
      return true;
    });
  }

  /**
   * The user switched Phisheck off (FR12): every analysed or pending tab becomes
   * "skipped: disabled" at once, which clears its badge and popup, and its banner is removed.
   * A pending analysis' late result is then discarded as stale.
   */
  handleSwitchedOff(tabIds: number[]): Promise<void> {
    return Promise.all(
      tabIds.map((tabId) =>
        this.serialise(tabId, async () => {
          const state = await this.deps.getTabState(tabId);
          if (state === undefined || state.status === 'skipped') return;
          const { url, navigationId } = state;
          await this.store(tabId, { status: 'skipped', url, navigationId, reason: 'disabled' });
          await this.deps.hideBanner?.(tabId);
        }),
      ),
    ).then(() => undefined);
  }

  handleTabRemoved(tabId: number): Promise<void> {
    return this.serialise(tabId, () => this.deps.clearTabState(tabId));
  }
}
