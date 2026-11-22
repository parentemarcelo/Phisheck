// PLAN 4.6: the toolbar badge shows only on flagged tabs and clears on navigation (FR9).
import type { Page } from 'playwright';
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
let page: Page;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
  });
  page = await session.context.newPage();
}, 60_000);

afterAll(async () => {
  await session?.close();
});

const badge = (tabId: number) =>
  session.serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

describe('badge', { timeout: 30_000 }, () => {
  it('is set on a flagged page', async () => {
    await page.goto(PAGES.phishing.url);
    await settledTabState(session, page);
    expect(await badge(await tabIdOf(session, page))).toBe('!');
  });

  it('is cleared after navigating away and stays empty on a benign page', async () => {
    const tabId = await tabIdOf(session, page);
    await page.goto(PAGES.benign.url);
    const state = await settledTabState(session, page, (s) => s.url === PAGES.benign.url);
    expect(state).toMatchObject({ status: 'done', flagged: false });
    expect(await badge(tabId)).toBe('');
  });

  it('is cleared when leaving for a non-http page', async () => {
    await page.goto(PAGES.phishing.url);
    await settledTabState(session, page, (s) => s.url === PAGES.phishing.url);
    const tabId = await tabIdOf(session, page);
    expect(await badge(tabId)).toBe('!');
    await page.goto('about:blank');
    await expect.poll(() => badge(tabId)).toBe('');
  });
});
