// PLAN 4.7: warning banner (FR7, FR8, D26, D30).
import type { Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  setSettings,
  settledTabState,
  type ExtensionSession,
} from './harness.js';

/** Hostile page CSS: must not change, hide or shift the banner. */
const HOSTILE_CSS = `<style>
* { color: rgb(255, 0, 0) !important; font: 40px serif !important; background: lime !important; }
button { display: none !important; }
div { visibility: hidden !important; }
phisheck-banner { display: none !important; top: 300px !important; opacity: 0 !important; }
body { transform: translateX(50px); margin: 0; }
</style>`;
const HOSTILE_URL = 'http://paypal-account-verify.xyz/signin/styled';

const SPA_URL = 'http://paypal-account-verify.xyz/app/login';
const SPA_HTML = PAGES.phishing.html.replace(
  '</body>',
  `<a id="go" href="/app/help">Help</a><script>
document.getElementById('go').addEventListener('click', (e) => {
  e.preventDefault(); history.pushState({}, '', '/app/help');
});</script></body>`,
);

let session: ExtensionSession;
let page: Page;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
    [HOSTILE_URL]: PAGES.phishing.html.replace('</head>', `${HOSTILE_CSS}</head>`),
    [SPA_URL]: SPA_HTML,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

beforeEach(async () => {
  await page?.close();
  page = await session.context.newPage();
});

const banner = () => page.locator('phisheck-banner [role=alert]');

describe('warning banner', { timeout: 30_000 }, () => {
  it('shows on a flagged page with the confidence', async () => {
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);
    expect(await banner().textContent()).toMatch(/Phisheck: likely phishing — \d{2,3}% confidence/);
    expect(await page.getByRole('button', { name: 'Dismiss' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Trust this URL' }).isVisible()).toBe(true);
  });

  it('does not show on a benign page', async () => {
    await page.goto(PAGES.benign.url);
    await settledTabState(session, page);
    await new Promise((r) => setTimeout(r, 300));
    expect(await page.locator('phisheck-banner').count()).toBe(0);
  });

  it('hides on Dismiss and comes back on the next visit (D30)', async () => {
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    expect(await page.locator('phisheck-banner').count()).toBe(0);
    await page.reload();
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);
  });

  it('is not affected by page styles and does not shift the page', async () => {
    await page.goto(HOSTILE_URL);
    const bodyTop = await page.evaluate(() => document.body.getBoundingClientRect().top);
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);

    const trust = page.getByRole('button', { name: 'Trust this URL' });
    expect(await trust.isVisible()).toBe(true);
    const box = await page.locator('phisheck-banner').boundingBox();
    expect(box).toMatchObject({ x: 0, y: 0 });
    expect(box?.width).toBe(page.viewportSize()?.width);
    const styles = await banner().evaluate((bar) => {
      const s = getComputedStyle(bar);
      return { color: s.color, fontSize: s.fontSize, visibility: s.visibility };
    });
    expect(styles).toEqual({
      color: 'rgb(255, 255, 255)',
      fontSize: '14px',
      visibility: 'visible',
    });
    // Overlay only: the page's own layout is unchanged.
    expect(await page.evaluate(() => document.body.getBoundingClientRect().top)).toBe(bodyTop);
  });

  it('ignores clicks synthesised by page scripts', async () => {
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);
    await page.evaluate(() => {
      const root = document.querySelector('phisheck-banner')?.shadowRoot;
      root?.querySelectorAll('button').forEach((b) => b.click());
    });
    expect(await banner().count()).toBe(1);
  });

  it('is removed when an SPA moves to another page', async () => {
    await page.goto(SPA_URL);
    await expect.poll(() => banner().count(), { timeout: 15_000 }).toBe(1);
    // The new page is trusted, so it is not analysed: only the service worker's
    // hide-banner message can remove the old verdict's banner.
    await setSettings(session, { trustedUrls: [new URL('/app/help', SPA_URL).href] });
    await page.evaluate(() => document.getElementById('go')?.click());
    await page.waitForURL('**/app/help');
    const state = await settledTabState(session, page, (s) => s.url.endsWith('/app/help'));
    expect(state).toMatchObject({ status: 'skipped', reason: 'trusted' });
    await expect.poll(() => page.locator('phisheck-banner').count()).toBe(0);
    await setSettings(session, { trustedUrls: [] });
  });
});
