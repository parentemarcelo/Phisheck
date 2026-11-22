// PLAN 4.10: popup UI — verdict, confidence and Trust (FR10).
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

const popupUrl = (tabId: number) =>
  `chrome-extension://${session.extensionId}/popup.html?tabId=${tabId}`;

describe('popup', { timeout: 30_000 }, () => {
  it('shows the verdict and confidence of the tab state', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    const state = await settledTabState(session, page);
    if (state.status !== 'done') throw new Error('not analysed');
    const tabId = await tabIdOf(session, page);

    const popup = await session.context.newPage();
    await popup.goto(popupUrl(tabId));
    await expect.poll(() => popup.locator('#verdict').textContent()).toBe('Likely phishing');
    expect(await popup.locator('#confidence').textContent()).toBe(
      `${Math.floor(state.probability * 100)}% confidence`,
    );
    expect(await popup.locator('#url').textContent()).toBe(PAGES.phishing.url);
    expect(await popup.getByRole('button', { name: 'Trust this URL' }).isVisible()).toBe(true);
    await popup.close();
    await page.close();
  });

  it('trusts the URL from the popup: banner and badge go, and stay gone on reload', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
    const tabId = await tabIdOf(session, page);

    const popup = await session.context.newPage();
    await popup.goto(popupUrl(tabId));
    await popup.getByRole('button', { name: 'Trust this URL' }).click();
    await expect.poll(() => popup.locator('#status').textContent()).toMatch(/^Trusted/);

    await expect.poll(() => page.locator('phisheck-banner').count()).toBe(0);
    const badge = () =>
      session.serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    expect(await badge()).toBe('');
    await page.reload();
    await settledTabState(session, page, (s) => s.status === 'skipped');
    expect(await page.locator('phisheck-banner').count()).toBe(0);
    expect(await badge()).toBe('');
    await popup.close();
    await page.close();
  });

  it('shows no verdict for a tab that is not flagged', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.benign.url);
    await settledTabState(session, page);
    const popup = await session.context.newPage();
    await popup.goto(popupUrl(await tabIdOf(session, page)));
    await expect
      .poll(() => popup.locator('#verdict').textContent())
      .toBe('No warning for this page');
    expect(await popup.getByRole('button', { name: 'Trust this URL' }).isHidden()).toBe(true);
    await popup.close();
    await page.close();
  });

  it('opens Settings from its Settings button', async () => {
    const popup = await session.context.newPage();
    await popup.goto(popupUrl(999999));
    const opened = session.context.waitForEvent('page', {
      predicate: (p) => p.url().endsWith('/settings.html'),
    });
    await popup.getByRole('button', { name: 'Settings' }).click();
    expect((await opened).url()).toMatch(/settings\.html$/);
    await popup.close();
  });
});
