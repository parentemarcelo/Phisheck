/**
 * Per-tab analysis state in chrome.storage.session (memory only, cleared when the browser
 * closes; never synced). It records the latest navigation of each tab and its verdict. It is
 * not a cache: every navigation replaces it and is analysed again (FR5).
 */
import type { StorageAreaLike } from './settings.js';

export type TabState =
  | { status: 'pending'; url: string; navigationId: string; startedAt: number }
  | {
      status: 'done';
      url: string;
      navigationId: string;
      probability: number;
      threshold: number;
      flagged: boolean;
      analysedAt: number;
      domError?: string;
    }
  | { status: 'skipped'; url: string; navigationId: string; reason: 'disabled' | 'trusted' }
  | { status: 'error'; url: string; navigationId: string; message: string };

export type SessionAreaLike = StorageAreaLike & { remove(keys: string | string[]): Promise<void> };

export const tabKey = (tabId: number): string => `tab:${tabId}`;

function defaultArea(): SessionAreaLike {
  return chrome.storage.session;
}

export async function getTabState(
  tabId: number,
  area: SessionAreaLike = defaultArea(),
): Promise<TabState | undefined> {
  const key = tabKey(tabId);
  return (await area.get([key]))[key] as TabState | undefined;
}

export function setTabState(tabId: number, state: TabState, area: SessionAreaLike = defaultArea()) {
  return area.set({ [tabKey(tabId)]: state });
}

export function clearTabState(tabId: number, area: SessionAreaLike = defaultArea()) {
  return area.remove(tabKey(tabId));
}

export function isFlagged(state: TabState | undefined): boolean {
  return state?.status === 'done' && state.flagged;
}
