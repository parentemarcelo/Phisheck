// PLAN 4.8: "Trust this URL" adds the exact URL to the allowlist (FR8, D7, D27).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';

const OTHER_URL = 'http://paypal-account-verify.xyz/signin/other';
let session: ExtensionSession;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [OTHER_URL]: PAGES.phishing.html,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

const badge = (tabId: number) =>
  session.serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

describe('trust flow', { timeout: 30_000 }, () => {
  it('trusts the exact URL: no banner and no badge after reload', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    const banner = page.locator('phisheck-banner');
    await expect.poll(() => banner.count(), { timeout: 15_000 }).toBe(1);
    const tabId = await tabIdOf(session, page);
    expect(await badge(tabId)).toBe('!');

    await page.getByRole('button', { name: 'Trust this URL' }).click();
    await expect.poll(() => banner.count()).toBe(0);
    await expect.poll(() => badge(tabId)).toBe('');
    const stored = await session.serviceWorker.evaluate(() =>
      chrome.storage.local.get('trustedUrls'),
    );
    expect(stored.trustedUrls).toEqual([PAGES.phishing.url]);

    await page.reload();
    const state = await settledTabState(session, page, (s) => s.status === 'skipped');
    expect(state).toMatchObject({ status: 'skipped', reason: 'trusted' });
    await new Promise((r) => setTimeout(r, 500));
    expect(await banner.count()).toBe(0);
    expect(await badge(tabId)).toBe('');
  });

  it('does not trust other URLs of the same site', async () => {
    const page = await session.context.newPage();
    await page.goto(OTHER_URL);
    await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
  });
});
