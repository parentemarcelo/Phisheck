/**
 * Toolbar state per tab (PLAN 4.6, 4.9; FR9, FR10, D28). Only flagged tabs get a badge and
 * a popup. On every other tab the action has no popup, so a click fires `action.onClicked`,
 * which opens the Settings page. Every navigation first stores a new (pending/cleared) tab
 * state, which resets both, so a verdict never outlives its page.
 */
import { confidenceText } from '../common/format.js';
import { isFlagged, type TabState } from '../common/tab-state.js';

export const BADGE_TEXT = '!';
export const BADGE_COLOR = '#c5221f';
export const DEFAULT_TITLE = 'Phisheck';
export const POPUP_PAGE = 'popup.html';

/** The part of chrome.action this module uses (mockable). */
export interface ActionLike {
  setBadgeText(details: { tabId: number; text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { tabId: number; color: string }): Promise<void>;
  setTitle(details: { tabId: number; title: string }): Promise<void>;
  setPopup(details: { tabId: number; popup: string }): Promise<void>;
}

export async function updateToolbar(
  action: ActionLike,
  tabId: number,
  state: TabState | undefined,
): Promise<void> {
  try {
    if (state?.status === 'done' && isFlagged(state)) {
      await action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
      await action.setBadgeText({ tabId, text: BADGE_TEXT });
      await action.setPopup({ tabId, popup: POPUP_PAGE });
      await action.setTitle({
        tabId,
        title: `Phisheck: likely phishing (${confidenceText(state.probability)} confidence)`,
      });
    } else {
      await action.setPopup({ tabId, popup: '' });
      await action.setBadgeText({ tabId, text: '' });
      await action.setTitle({ tabId, title: DEFAULT_TITLE });
    }
  } catch {
    // The tab was closed meanwhile: nothing to update.
  }
}

/** A click on the toolbar button of a tab without popup (not flagged) opens Settings. */
export function listenForToolbarClicks(
  onClicked: { addListener(callback: () => void): void },
  openSettings: () => Promise<void>,
): void {
  onClicked.addListener(() => void openSettings());
}
