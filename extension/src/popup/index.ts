/**
 * Popup (PLAN 4.10, FR10, D28): set by the service worker only on flagged tabs. Shows the
 * verdict, the confidence and a "Trust this URL" button for the tab it belongs to.
 * The tab is the active tab of the window, or `?tabId=` (used by E2E tests, which open the
 * popup page in a normal tab).
 */
import { confidenceText } from '../common/format.js';
import type { TrustMessage } from '../common/messages.js';
import { getTabState, isFlagged, type TabState } from '../common/tab-state.js';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`popup.html has no #${id}`);
  return node as T;
}

async function currentTabId(): Promise<number | undefined> {
  const param = new URLSearchParams(location.search).get('tabId');
  if (param !== null && /^\d+$/.test(param)) return Number(param);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function render(tabId: number | undefined, state: TabState | undefined): void {
  const verdict = byId('verdict');
  const confidence = byId('confidence');
  const url = byId('url');
  const advice = byId('advice');
  const trust = byId<HTMLButtonElement>('trust');

  if (tabId === undefined || state?.status !== 'done' || !isFlagged(state)) {
    document.body.classList.remove('flagged');
    verdict.textContent = 'No warning for this page';
    confidence.textContent = '';
    url.textContent = state?.url ?? '';
    advice.textContent = 'Phisheck only shows details when it flags a page.';
    trust.hidden = true;
    return;
  }

  document.body.classList.add('flagged');
  verdict.textContent = 'Likely phishing';
  confidence.textContent = `${confidenceText(state.probability)} confidence`;
  url.textContent = state.url;
  advice.textContent =
    "This page looks like a phishing page. Don't enter passwords, codes or payment details. " +
    'If you know this page is safe, trust it and Phisheck will not warn about it again.';
  trust.hidden = false;
  trust.onclick = async () => {
    trust.disabled = true;
    const message: TrustMessage = { type: 'phisheck:trust', url: state.url, tabId };
    const ok = (await chrome.runtime.sendMessage(message)) as boolean | undefined;
    if (ok === true) {
      trust.hidden = true;
      byId('status').textContent = 'Trusted. Phisheck will not warn about this URL again.';
    } else {
      trust.disabled = false;
      byId('status').textContent = 'Could not trust this URL. Please try again.';
    }
  };
}

async function main(): Promise<void> {
  byId('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  const tabId = await currentTabId();
  render(tabId, tabId === undefined ? undefined : await getTabState(tabId));
}

void main();
