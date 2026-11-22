import { FEATURE_NAMES, SCHEMA_VERSION, type FeatureVector } from '@phisheck/shared/features';
import type { Model } from '@phisheck/shared/model-runtime';
import { describe, expect, it, vi } from 'vitest';
import type { FeaturesMessage } from '../common/messages.js';
import { DEFAULT_SETTINGS, type Settings } from '../common/settings.js';
import type { TabState } from '../common/tab-state.js';
import { Analyser, type AnalyserDeps } from './analyser.js';

const URL_A = 'https://login.example.xyz/a';
const width = FEATURE_NAMES.length;

function setup(settings: Partial<Settings> = {}, probability = 0.9) {
  const states = new Map<number, TabState>();
  let id = 0;
  const current = { ...DEFAULT_SETTINGS, ...settings };
  const deps = {
    getSettings: vi.fn(() => Promise.resolve(current)),
    getTabState: vi.fn((tabId: number) => Promise.resolve(states.get(tabId))),
    setTabState: vi.fn(async (tabId: number, s: TabState) => {
      states.set(tabId, s);
    }),
    clearTabState: vi.fn(async (tabId: number) => {
      states.delete(tabId);
    }),
    inject: vi.fn(() => Promise.resolve()),
    trustUrl: vi.fn((url: string) => {
      current.trustedUrls = [...current.trustedUrls, url];
      return Promise.resolve();
    }),
    model: () =>
      ({ featureNames: FEATURE_NAMES, schemaVersion: SCHEMA_VERSION }) as unknown as Model,
    predict: vi.fn<(model: Model, vector: FeatureVector) => number>(() => probability),
    newId: () => `nav${++id}`,
    now: () => 1000,
    onStateChange: vi.fn(),
  } satisfies AnalyserDeps;
  return { analyser: new Analyser(deps), deps, states, settings: current };
}

const features = (
  navigationId: string,
  values: (number | null)[] = new Array(width).fill(0),
): FeaturesMessage => ({
  type: 'phisheck:features',
  navigationId,
  url: URL_A,
  vector: { schemaVersion: SCHEMA_VERSION, values },
});

const analyse = { action: 'analyse', tabId: 1, url: URL_A, reason: 'navigation' } as const;

describe('Analyser', () => {
  it('marks the tab pending, injects, then stores the verdict', async () => {
    const { analyser, deps, states } = setup();
    await analyser.handleNavigation(analyse);
    expect(states.get(1)).toEqual({
      status: 'pending',
      url: URL_A,
      navigationId: 'nav1',
      startedAt: 1000,
    });
    expect(deps.inject).toHaveBeenCalledWith(1, 'nav1');

    const response = await analyser.handleFeatures(1, features('nav1'));
    expect(response).toEqual({ status: 'done', flagged: true, probability: 0.9, threshold: 0.8 });
    expect(states.get(1)).toMatchObject({ status: 'done', flagged: true, probability: 0.9 });
    expect(deps.onStateChange).toHaveBeenCalledTimes(2);
  });

  it('applies the threshold with >= (FR7)', async () => {
    const { analyser } = setup({ threshold: 0.9 }, 0.9);
    await analyser.handleNavigation(analyse);
    expect(await analyser.handleFeatures(1, features('nav1'))).toMatchObject({ flagged: true });
    const below = setup({ threshold: 0.91 }, 0.9);
    await below.analyser.handleNavigation(analyse);
    expect(await below.analyser.handleFeatures(1, features('nav1'))).toMatchObject({
      flagged: false,
    });
  });

  it('restores missing (null) values as NaN before inference', async () => {
    const { analyser, deps } = setup();
    await analyser.handleNavigation(analyse);
    const values: (number | null)[] = new Array(width).fill(1);
    values[3] = null;
    await analyser.handleFeatures(1, features('nav1', values));
    const vector = deps.predict.mock.calls[0]?.[1];
    expect(Number.isNaN(vector?.values[3])).toBe(true);
  });

  it('discards results of an older navigation of the tab', async () => {
    const { analyser, states } = setup();
    await analyser.handleNavigation(analyse);
    await analyser.handleNavigation({ ...analyse, url: 'https://other.example/' });
    expect(await analyser.handleFeatures(1, features('nav1'))).toEqual({ status: 'stale' });
    expect(states.get(1)).toMatchObject({ status: 'pending', navigationId: 'nav2' });
  });

  it('discards a second result for the same navigation', async () => {
    const { analyser } = setup();
    await analyser.handleNavigation(analyse);
    await analyser.handleFeatures(1, features('nav1'));
    expect(await analyser.handleFeatures(1, features('nav1'))).toEqual({ status: 'stale' });
  });

  it('skips without injecting when switched off (FR12) or trusted (FR6)', async () => {
    const off = setup({ enabled: false });
    await off.analyser.handleNavigation(analyse);
    expect(off.deps.inject).not.toHaveBeenCalled();
    expect(off.states.get(1)).toMatchObject({ status: 'skipped', reason: 'disabled' });

    const trusted = setup({ trustedDomains: [{ domain: 'example.xyz', includeSubdomains: true }] });
    await trusted.analyser.handleNavigation(analyse);
    expect(trusted.deps.inject).not.toHaveBeenCalled();
    expect(trusted.states.get(1)).toMatchObject({ status: 'skipped', reason: 'trusted' });
  });

  it('honours settings changed while the page was loading', async () => {
    const { analyser, deps, settings } = setup();
    await analyser.handleNavigation(analyse);
    settings.enabled = false;
    expect(await analyser.handleFeatures(1, features('nav1'))).toEqual({
      status: 'skipped',
      reason: 'disabled',
    });
    expect(deps.predict).not.toHaveBeenCalled();
  });

  it('records an injection failure as an error', async () => {
    const { analyser, deps, states } = setup();
    deps.inject.mockRejectedValueOnce(new Error('Frame with ID 0 is showing error page'));
    await analyser.handleNavigation(analyse);
    expect(states.get(1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('error page'),
    });
  });

  it('rejects malformed vectors without crashing', async () => {
    const { analyser, deps, states } = setup();
    await analyser.handleNavigation(analyse);
    const response = await analyser.handleFeatures(1, features('nav1', [1, 2, 3]));
    expect(response).toMatchObject({
      status: 'error',
      message: expect.stringContaining(`${width} values`),
    });
    expect(states.get(1)?.status).toBe('error');
    expect(deps.predict).not.toHaveBeenCalled();
  });

  it('removes a stale banner on SPA navigations only', async () => {
    const { deps } = setup();
    const hideBanner = vi.fn(() => Promise.resolve());
    const withHide = new Analyser({ ...deps, hideBanner });
    await withHide.handleNavigation(analyse);
    expect(hideBanner).not.toHaveBeenCalled();
    await withHide.handleNavigation({ ...analyse, reason: 'spa' });
    expect(hideBanner).toHaveBeenCalledWith(1);
  });

  it('trusts the URL and turns the verdict into skipped:trusted', async () => {
    const { analyser, deps, states } = setup();
    await analyser.handleNavigation(analyse);
    await analyser.handleFeatures(1, features('nav1'));
    const hideBanner = vi.fn(() => Promise.resolve());
    const withHide = new Analyser({ ...deps, hideBanner });
    expect(await withHide.handleTrust(1, URL_A)).toBe(true);
    expect(deps.trustUrl).toHaveBeenCalledWith(URL_A);
    expect(hideBanner).toHaveBeenCalledWith(1);
    expect(states.get(1)).toEqual({
      status: 'skipped',
      url: URL_A,
      navigationId: 'nav1',
      reason: 'trusted',
    });
  });

  it('reports a failed trust and keeps the verdict', async () => {
    const { analyser, deps, states } = setup();
    deps.trustUrl.mockRejectedValueOnce(new Error('invalid'));
    await analyser.handleNavigation(analyse);
    await analyser.handleFeatures(1, features('nav1'));
    expect(await analyser.handleTrust(1, URL_A)).toBe(false);
    expect(states.get(1)?.status).toBe('done');
  });

  it('switching off clears verdicts and banners of open tabs and discards pending results', async () => {
    const { deps, states } = setup();
    const hideBanner = vi.fn(() => Promise.resolve());
    const a = new Analyser({ ...deps, hideBanner });
    await a.handleNavigation(analyse); // tab 1: flagged
    await a.handleFeatures(1, features('nav1'));
    await a.handleNavigation({ ...analyse, tabId: 2 }); // tab 2: still pending
    await a.handleSwitchedOff([1, 2, 3]); // tab 3: nothing recorded

    expect(states.get(1)).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(states.get(2)).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(states.has(3)).toBe(false);
    expect(hideBanner.mock.calls).toEqual([[1], [2]]);
    expect(await a.handleFeatures(2, features('nav2'))).toEqual({ status: 'stale' });
  });

  it('clears on non-http navigations and closed tabs', async () => {
    const { analyser, states } = setup();
    await analyser.handleNavigation(analyse);
    await analyser.handleNavigation({ action: 'clear', tabId: 1 });
    expect(states.has(1)).toBe(false);
    await analyser.handleNavigation(analyse);
    await analyser.handleTabRemoved(1);
    expect(states.has(1)).toBe(false);
  });

  it('serialises work per tab: a navigation queued behind a result wins', async () => {
    const { analyser, deps, states } = setup();
    await analyser.handleNavigation(analyse);
    let release!: () => void;
    deps.getSettings.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ ...DEFAULT_SETTINGS }))),
    );
    const result = analyser.handleFeatures(1, features('nav1'));
    const next = analyser.handleNavigation({ ...analyse, url: 'https://b.example/' });
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    await Promise.all([result, next]);
    expect(states.get(1)).toMatchObject({ status: 'pending', navigationId: 'nav2' });
  });
});
