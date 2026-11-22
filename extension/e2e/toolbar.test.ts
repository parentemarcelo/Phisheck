// PLAN 4.9: the toolbar button opens a popup only on flagged tabs; elsewhere it opens Settings
// (FR10, D28). Playwright cannot click the browser toolbar itself, so the test checks the
// per-tab popup Chrome would open on click and opens it with chrome.action.openPopup(), which
// shows the active tab's popup exactly as a click would. Without a popup a click fires
// action.onClicked, whose listener (unit-tested in toolbar.test.ts) opens Settings.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';

let session: ExtensionSession;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

const popupOf = (tabId: number) =>
  session.serviceWorker.evaluate((id) => chrome.action.getPopup({ tabId: id }), tabId);

describe('toolbar button', { timeout: 30_000 }, () => {
  it('has a popup on a flagged tab, which opens on click', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    await settledTabState(session, page);
    const tabId = await tabIdOf(session, page);
    expect(await popupOf(tabId)).toBe(`chrome-extension://${session.extensionId}/popup.html`);

    await page.bringToFront();
    const error = await session.serviceWorker.evaluate(() =>
      chrome.action.openPopup().then(
        () => null,
        (e: unknown) => String(e),
      ),
    );
    expect(error).toBeNull();
    // Extension popups are not exposed as Playwright pages; ask Chrome for open popups.
    await expect
      .poll(() =>
        session.serviceWorker.evaluate(async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['POPUP' as chrome.runtime.ContextType],
            })
          ).map((c) => c.documentUrl),
        ),
      )
      .toEqual([`chrome-extension://${session.extensionId}/popup.html`]);
    await page.close();
  });

  it('has no popup on a benign tab, so a click goes to onClicked → Settings', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.benign.url);
    await settledTabState(session, page);
    expect(await popupOf(await tabIdOf(session, page))).toBe('');
    expect(await session.serviceWorker.evaluate(() => chrome.action.onClicked.hasListeners())).toBe(
      true,
    );
  });

  it('opens the Settings page in a tab', async () => {
    const opened = session.context.waitForEvent('page', {
      predicate: (p) => p.url().endsWith('/settings.html'),
      timeout: 10_000,
    });
    await session.serviceWorker.evaluate(() => chrome.runtime.openOptionsPage());
    expect((await opened).url()).toBe(`chrome-extension://${session.extensionId}/settings.html`);
  });

  it('drops the popup when the flagged tab navigates away', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    await settledTabState(session, page);
    const tabId = await tabIdOf(session, page);
    expect(await popupOf(tabId)).not.toBe('');
    await page.goto(PAGES.benign.url);
    await settledTabState(session, page, (s) => s.url === PAGES.benign.url);
    expect(await popupOf(tabId)).toBe('');
    await page.close();
  });
});
