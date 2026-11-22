/**
 * Navigation detection (PLAN 4.4, FR1, FR2, D11, D12).
 *
 * - Only the main frame of a tab counts (frameId 0, not a prerendering document).
 * - Only http(s) pages are analysed. A main-frame commit to anything else (chrome://, file://,
 *   about:, extension pages, data: …) clears the tab's verdict without analysing.
 * - Every committed main-frame navigation is analysed, including reloads and back/forward:
 *   there is no verdict cache (FR5).
 * - SPA URL changes (History API) are analysed only when the origin or path changes; a change
 *   to only the query or #fragment of the same path is ignored. In-page fragment navigations
 *   (onReferenceFragmentUpdated) are not listened to at all.
 *
 * The decisions are pure functions; `listenForNavigations` wires them to chrome.webNavigation.
 * The previous URL of a tab is passed in by the caller (it lives in the tab state in
 * chrome.storage.session, because the MV3 service worker can be stopped between events).
 */

export interface CommitDetails {
  tabId: number;
  frameId: number;
  url: string;
  documentLifecycle?: string;
}

export type HistoryDetails = CommitDetails;

export type NavigationDecision =
  | { action: 'analyse'; tabId: number; url: string; reason: 'navigation' | 'spa' }
  | { action: 'clear'; tabId: number }
  | { action: 'ignore' };

const IGNORE: NavigationDecision = { action: 'ignore' };

export function isAnalysableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isMainFrame(details: CommitDetails): boolean {
  // Prerendered pages commit before the user sees them; they are analysed if and when they
  // are shown as a real navigation, never in the background (G3).
  return details.frameId === 0 && details.tabId >= 0 && details.documentLifecycle !== 'prerender';
}

/** A full (document) navigation committed in some frame. */
export function onCommittedDecision(details: CommitDetails): NavigationDecision {
  if (!isMainFrame(details)) return IGNORE;
  if (!isAnalysableUrl(details.url)) return { action: 'clear', tabId: details.tabId };
  return { action: 'analyse', tabId: details.tabId, url: details.url, reason: 'navigation' };
}

/** True when `next` is a different page than `previous`: origin or path changed. */
export function isNewPath(previous: string, next: string): boolean {
  try {
    const a = new URL(previous);
    const b = new URL(next);
    return a.origin !== b.origin || a.pathname !== b.pathname;
  } catch {
    return true;
  }
}

/**
 * A History API URL change (pushState/replaceState) in some frame. `previousUrl` is the last
 * URL analysed (or seen) in this tab, or undefined if unknown, in which case it is analysed.
 */
export function onHistoryStateDecision(
  details: HistoryDetails,
  previousUrl: string | undefined,
): NavigationDecision {
  if (!isMainFrame(details) || !isAnalysableUrl(details.url)) return IGNORE;
  if (previousUrl !== undefined && !isNewPath(previousUrl, details.url)) return IGNORE;
  return { action: 'analyse', tabId: details.tabId, url: details.url, reason: 'spa' };
}

type Listener<T> = (details: T) => void;
interface EventLike<T> {
  addListener(callback: Listener<T>): void;
}

/** The part of chrome.webNavigation this module uses (mockable). */
export interface WebNavigationLike {
  onCommitted: EventLike<CommitDetails>;
  onHistoryStateUpdated: EventLike<HistoryDetails>;
}

/**
 * Registers the navigation listeners. Must be called synchronously at service-worker start
 * so Chrome wakes the worker for these events. `previousUrl` reads the tab's last URL.
 */
export function listenForNavigations(
  webNavigation: WebNavigationLike,
  previousUrl: (tabId: number) => Promise<string | undefined>,
  handle: (decision: NavigationDecision) => void | Promise<void>,
): void {
  webNavigation.onCommitted.addListener((details) => {
    const decision = onCommittedDecision(details);
    if (decision.action !== 'ignore') void handle(decision);
  });
  webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (!isMainFrame(details)) return;
    void previousUrl(details.tabId).then((previous) => {
      const decision = onHistoryStateDecision(details, previous);
      if (decision.action !== 'ignore') return handle(decision);
    });
  });
}
