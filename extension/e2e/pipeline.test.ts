// PLAN 4.5: navigation → content-script extraction → service-worker inference → tab state.
import type { Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  settledTabState,
  tabIdOf,
  tabState,
  type ExtensionSession,
} from './harness.js';

const SPA_URL = 'https://mail.riversidegarden.org/inbox';
// A single-page app: links change the URL with the History API, without a document load.
const SPA_HTML = `<!doctype html><html><head><title>Garden mail</title></head><body>
<a id="path" href="/sent">Sent</a> <a id="query" href="/inbox?page=2">Next</a>
<script>
for (const a of document.querySelectorAll('a')) a.addEventListener('click', (e) => {
  e.preventDefault(); history.pushState({}, '', a.getAttribute('href'));
});
</script></body></html>`;

let session: ExtensionSession;
let page: Page;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
    [SPA_URL]: SPA_HTML,
    [new URL('/sent', SPA_URL).href]: SPA_HTML,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

beforeEach(async () => {
  await page?.close();
  page = await session.context.newPage();
});

describe('analysis pipeline', { timeout: 30_000 }, () => {
  it('flags the phishing fixture and records the verdict in the tab state', async () => {
    await page.goto(PAGES.phishing.url);
    const state = await settledTabState(session, page);
    expect(state).toMatchObject({
      status: 'done',
      url: PAGES.phishing.url,
      flagged: true,
      threshold: 0.8,
    });
    expect(state.status === 'done' && state.probability).toBeGreaterThanOrEqual(0.8);
    expect(state).not.toHaveProperty('domError');
  });

  it('does not flag the benign fixture', async () => {
    await page.goto(PAGES.benign.url);
    const state = await settledTabState(session, page);
    expect(state).toMatchObject({ status: 'done', flagged: false });
    expect(state.status === 'done' && state.probability).toBeLessThan(0.5);
  });

  it('analyses every visit again, including reloads (no cache)', async () => {
    await page.goto(PAGES.phishing.url);
    const first = await settledTabState(session, page);
    await page.reload();
    const second = await settledTabState(
      session,
      page,
      (s) => s.navigationId !== first.navigationId,
    );
    expect(second.status).toBe('done');
  });

  it('re-analyses an SPA path change but not a query-only change', async () => {
    await page.goto(SPA_URL);
    const first = await settledTabState(session, page);
    expect(first.status).toBe('done');

    await page.click('#query');
    await page.waitForURL('**/inbox?page=2');
    await new Promise((r) => setTimeout(r, 1500));
    expect((await tabState(session, await tabIdOf(session, page)))?.navigationId).toBe(
      first.navigationId,
    );

    await page.click('#path');
    await page.waitForURL('**/sent');
    const second = await settledTabState(
      session,
      page,
      (s) => s.navigationId !== first.navigationId,
    );
    expect(second).toMatchObject({ status: 'done', url: new URL('/sent', SPA_URL).href });
  });

  it('clears the tab state on a non-http page', async () => {
    await page.goto(PAGES.benign.url);
    const tabId = await tabIdOf(session, page);
    await settledTabState(session, page);
    await page.goto('about:blank');
    await expect.poll(() => tabState(session, tabId)).toBeUndefined();
  });
});
