// PLAN 4.12: the on/off switch is honoured (FR12, D31).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  setSettings,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';

let session: ExtensionSession;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, { [PAGES.phishing.url]: PAGES.phishing.html });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

const badge = (tabId: number) =>
  session.serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

describe('on/off switch', { timeout: 30_000 }, () => {
  it('off: a flagged page is not analysed and shows nothing; on: the warning returns', async () => {
    await setSettings(session, { enabled: false });
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    const off = await settledTabState(session, page);
    expect(off).toMatchObject({ status: 'skipped', reason: 'disabled' }); // never injected
    const tabId = await tabIdOf(session, page);
    await new Promise((r) => setTimeout(r, 1000));
    expect(await page.locator('phisheck-banner').count()).toBe(0);
    expect(await badge(tabId)).toBe('');

    await setSettings(session, { enabled: true });
    await page.reload();
    await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
    expect(await badge(tabId)).toBe('!');
    await page.close();
  });

  it('switching off removes the banner, badge and popup of open tabs at once', async () => {
    await setSettings(session, { enabled: true });
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
    const tabId = await tabIdOf(session, page);

    await setSettings(session, { enabled: false });
    await expect.poll(() => page.locator('phisheck-banner').count()).toBe(0);
    await expect.poll(() => badge(tabId)).toBe('');
    expect(
      await session.serviceWorker.evaluate((id) => chrome.action.getPopup({ tabId: id }), tabId),
    ).toBe('');
    await setSettings(session, { enabled: true });
    await page.close();
  });
});
