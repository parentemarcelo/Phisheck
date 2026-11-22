/**
 * Service worker: navigation events, inference, allowlist, badge and per-tab popup.
 * Listeners are registered synchronously at start-up so Chrome wakes the worker for them.
 */
import { loadModel, predictVector, type Model } from '@phisheck/shared/model-runtime';
import modelJson from 'phisheck-model';
import {
  isFeaturesMessage,
  isTrustMessage,
  type HideBannerMessage,
  type VerdictResponse,
} from '../common/messages.js';
import { addTrustedUrl, getSettings, onSettingsChanged } from '../common/settings.js';
import { clearTabState, getTabState, setTabState } from '../common/tab-state.js';
import { Analyser } from './analyser.js';
import { listenForNavigations } from './navigation.js';
import { listenForToolbarClicks, updateToolbar } from './toolbar.js';

let model: Model | undefined;
/** Parsed on first use; the schema guard refuses a model built for another extractor. */
function getModel(): Model {
  model ??= loadModel(modelJson);
  return model;
}

declare global {
  var __phisheckNavigation: string | undefined;
}

async function inject(tabId: number, navigationId: string): Promise<void> {
  const target = { tabId, frameIds: [0] };
  // Both run in the extension's isolated world of the page's main frame, at document_idle.
  await chrome.scripting.executeScript({
    target,
    func: (id: string) => {
      globalThis.__phisheckNavigation = id;
    },
    args: [navigationId],
  });
  await chrome.scripting.executeScript({ target, files: ['content.js'] });
}

const analyser = new Analyser({
  getSettings: () => getSettings(),
  getTabState: (tabId) => getTabState(tabId),
  setTabState: (tabId, state) => setTabState(tabId, state),
  clearTabState: (tabId) => clearTabState(tabId),
  inject,
  trustUrl: addTrustedUrl,
  model: getModel,
  predict: predictVector,
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
  hideBanner: (tabId) =>
    chrome.tabs
      .sendMessage(tabId, { type: 'phisheck:hide-banner' } satisfies HideBannerMessage, {
        frameId: 0,
      })
      .catch(() => undefined), // no content script in this document: no banner either
  onStateChange: (tabId, state) => updateToolbar(chrome.action, tabId, state),
});

listenForNavigations(
  chrome.webNavigation,
  async (tabId) => (await getTabState(tabId))?.url,
  (decision) => analyser.handleNavigation(decision),
);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Web pages cannot message the extension (no externally_connectable); still, accept only
  // our own content scripts (in a tab's main frame) and our own pages (popup, settings).
  if (sender.id !== chrome.runtime.id) return false;
  const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL('')) === true;
  const contentTab = !fromExtensionPage && sender.frameId === 0 ? sender.tab?.id : undefined;

  if (isFeaturesMessage(message) && contentTab !== undefined) {
    void analyser
      .handleFeatures(contentTab, message)
      .then((response: VerdictResponse) => sendResponse(response));
    return true; // respond asynchronously
  }
  if (isTrustMessage(message)) {
    // A content script trusts its own tab; the popup names the tab it belongs to.
    const tabId = fromExtensionPage ? message.tabId : contentTab;
    if (tabId === undefined) return false;
    void analyser.handleTrust(tabId, message.url).then(sendResponse);
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => void analyser.handleTabRemoved(tabId));

listenForToolbarClicks(chrome.action.onClicked, () => chrome.runtime.openOptionsPage());

// Switching off takes effect on open tabs immediately; switching on applies from the next
// navigation (pages are only ever analysed when visited, G3).
onSettingsChanged((settings, changed) => {
  if (changed.includes('enabled') && !settings.enabled) {
    void chrome.tabs
      .query({})
      .then((tabs) =>
        analyser.handleSwitchedOff(tabs.flatMap((t) => (t.id === undefined ? [] : [t.id]))),
      );
  }
});
