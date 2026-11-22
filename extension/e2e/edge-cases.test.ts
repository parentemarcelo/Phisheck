// PLAN 5.2: edge cases — SPAs, huge DOMs, pages that never go idle, strict CSP, and pages that
// remove or hide the banner. Every case must end with the specified verdict and banner, and
// without errors in the page console or a failed analysis.
import type { Page, Route } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TabState } from '../src/common/tab-state.js';
import { MAX_RESTORES } from '../src/content/banner.js';
import {
  launchExtension,
  PAGES,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';

const PHISH = PAGES.phishing.html;
const ORIGIN = 'http://paypal-account-verify.xyz';
const withScript = (html: string, script: string) =>
  html.replace('</body>', `<script>${script}</script></body>`);

/** A page of the SPA: its path and the HTML of its <body>. */
const benignBody = /<body[^>]*>([\s\S]*)<\/body>/.exec(PAGES.benign.html)?.[1] ?? '';

/** ~60,000 elements and 20,000 links on top of the phishing page. */
const HUGE = PHISH.replace(
  '</body>',
  `<div id="huge">${Array.from(
    { length: 20_000 },
    (_, i) => `<p><a href="/item/${i}">Item ${i}</a> <span>${i}</span></p>`,
  ).join('')}</div></body>`,
);

/** The phishing page without its logo: the strict policy would block the page's own image. */
const PHISH_NO_IMAGES = PHISH.replace(/<img[^>]*>/g, '');
const STRICT_CSP =
  "default-src 'none'; style-src 'none'; img-src 'none'; font-src 'none'; " +
  "require-trusted-types-for 'script'; trusted-types 'none'; form-action 'none'";

interface Served {
  html?: string;
  headers?: Record<string, string>;
  /** Never answer (the request stays pending). */
  hang?: boolean;
}

const ROUTES: Record<string, Served> = {
  [`${ORIGIN}/app/login`]: {
    html: withScript(
      PHISH,
      `window.goTo = (path, html) => {
        history.pushState({}, '', path);
        if (html !== undefined) document.body.innerHTML = html;
      };`,
    ),
  },
  [`${ORIGIN}/huge/`]: { html: HUGE },
  // Keeps loading something every 100 ms for as long as it is open.
  [`${ORIGIN}/busy/`]: {
    html: withScript(
      PHISH,
      `setInterval(() => { new Image().src = '/ping?' + Math.random(); }, 100);`,
    ),
  },
  [`${ORIGIN}/ping`]: { html: '' },
  // An image that never arrives: the load event never fires.
  [`${ORIGIN}/never-loads/`]: {
    html: PHISH.replace('</body>', '<img src="/hang.png" alt=""></body>'),
  },
  [`${ORIGIN}/hang.png`]: { hang: true },
  [`${ORIGIN}/strict-csp/`]: {
    html: PHISH_NO_IMAGES,
    headers: { 'content-security-policy': STRICT_CSP },
  },
  [`${ORIGIN}/sandboxed/`]: {
    html: PHISH_NO_IMAGES,
    headers: { 'content-security-policy': `sandbox; ${STRICT_CSP}` },
  },
  [`${ORIGIN}/hostile/`]: { html: PHISH },
};

let session: ExtensionSession;
let page: Page;
let consoleErrors: string[];
const hanging: Route[] = [];

beforeAll(async () => {
  session = await launchExtension();
  await session.context.route(
    (url) => url.protocol === 'http:' || url.protocol === 'https:',
    (route) => {
      const url = route.request().url().split('#')[0]?.split('?')[0] ?? '';
      const served = ROUTES[url];
      if (served === undefined) return route.abort();
      if (served.hang) {
        hanging.push(route);
        return undefined;
      }
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', ...served.headers },
        body: served.html ?? '',
      });
    },
  );
}, 60_000);

afterAll(async () => {
  for (const r of hanging) await r.abort().catch(() => undefined);
  await session?.close();
});

beforeEach(async () => {
  await page?.close();
  page = await session.context.newPage();
  consoleErrors = [];
  page.on('console', (m) => {
    // Resources the test server refuses (e.g. the fixture's logo) are the page's own errors.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
});

const banner = () => page.locator('phisheck-banner [role=alert]');
const bannerCount = () => page.locator('phisheck-banner').count();

async function expectFlagged(timeout = 15_000): Promise<TabState> {
  await expect.poll(() => banner().count(), { timeout }).toBe(1);
  const state = await settledTabState(session, page);
  expect(state).toMatchObject({ status: 'done', flagged: true });
  expect(state).not.toHaveProperty('domError');
  return state;
}

const badgeText = async () => {
  const tabId = await tabIdOf(session, page);
  return session.serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
};

describe('edge cases', { timeout: 60_000 }, () => {
  describe('single-page apps (FR2)', () => {
    it('re-analyses a new path, but not a query or fragment change', async () => {
      await page.goto(`${ORIGIN}/app/login`);
      const first = await expectFlagged();

      // Same path, other query / fragment: no new analysis, the banner stays.
      await page.evaluate(() => {
        history.pushState({}, '', '/app/login?step=2');
        location.hash = 'details';
      });
      await new Promise((r) => setTimeout(r, 1_500));
      expect(await settledTabState(session, page)).toEqual(first);
      expect(await bannerCount()).toBe(1);

      // A new path with new content: analysed again, the old banner removed first.
      await page.evaluate((html) => {
        (window as unknown as { goTo: (p: string, h?: string) => void }).goTo('/app/help', html);
      }, benignBody);
      const next = await settledTabState(session, page, (s) => s.url.endsWith('/app/help'));
      expect(next.status).toBe('done');
      expect(next).not.toHaveProperty('domError');
      if (next.status === 'done') {
        await expect.poll(bannerCount).toBe(next.flagged ? 1 : 0);
        expect(next.probability).not.toBe(first.status === 'done' ? first.probability : NaN);
      }

      // Back to the first path (popstate) is a new path again.
      await page.goBack();
      await page.waitForURL('**/app/login?step=2#details');
      const back = await settledTabState(session, page, (s) => s.url.includes('/app/login'));
      expect(back.status).toBe('done');
      expect(consoleErrors).toEqual([]);
    });
  });

  it('analyses a huge DOM (~60,000 elements)', async () => {
    await page.goto(`${ORIGIN}/huge/`);
    expect(await page.locator('#huge a').count()).toBe(20_000);
    await expectFlagged(20_000);
    expect(consoleErrors).toEqual([]);
  });

  it('analyses a page that never goes network-idle, after at most ~3 s', async () => {
    const start = Date.now();
    await page.goto(`${ORIGIN}/busy/`);
    const loaded = Date.now();
    await expectFlagged();
    // Settle: up to 3 s of waiting for a quiet network after load, plus the analysis.
    expect(Date.now() - loaded).toBeLessThan(8_000);
    expect(Date.now() - start).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  it('analyses a page whose load event never fires, after the 10 s load timeout', async () => {
    const start = Date.now();
    await page.goto(`${ORIGIN}/never-loads/`, { waitUntil: 'domcontentloaded' });
    await expectFlagged(25_000);
    expect(Date.now() - start).toBeGreaterThanOrEqual(9_000);
    expect(consoleErrors).toEqual([]);
  });

  describe('strict Content Security Policy', () => {
    for (const path of ['/strict-csp/', '/sandboxed/']) {
      it(`shows a fully styled banner (${path})`, async () => {
        await page.goto(`${ORIGIN}${path}`);
        await expectFlagged();
        const look = await banner().evaluate((bar) => {
          const s = getComputedStyle(bar);
          return { background: s.backgroundColor, color: s.color, display: s.display };
        });
        expect(look).toEqual({
          background: 'rgb(179, 38, 30)',
          color: 'rgb(255, 255, 255)',
          display: 'flex',
        });
        expect(await page.getByRole('button', { name: 'Trust this URL' }).isVisible()).toBe(true);
        expect(consoleErrors).toEqual([]);
      });
    }
  });

  describe('pages that remove or hide the banner', () => {
    const attacks: Record<string, () => void> = {
      'removes it': () => document.querySelector('phisheck-banner')?.remove(),
      'moves it into a hidden element': () => {
        const box = document.createElement('div');
        box.style.display = 'none';
        document.body.append(box);
        const b = document.querySelector('phisheck-banner');
        if (b) box.append(b);
      },
      'hides it with an inline style': () =>
        document
          .querySelector<HTMLElement>('phisheck-banner')
          ?.style.setProperty('display', 'none', 'important'),
      'sets hidden and inert': () => {
        const b = document.querySelector('phisheck-banner');
        b?.setAttribute('hidden', '');
        b?.setAttribute('inert', '');
      },
      'empties its shadow root': () =>
        document.querySelector('phisheck-banner')?.shadowRoot?.replaceChildren(),
      'rewrites its text': () => {
        const root = document.querySelector('phisheck-banner')?.shadowRoot;
        root?.querySelectorAll('.title, .detail').forEach((n) => (n.textContent = 'All good'));
      },
      'replaces the whole <html> element': () => {
        const html = document.createElement('html');
        html.innerHTML = '<body><h1>Sign in</h1></body>';
        document.replaceChild(html, document.documentElement);
      },
    };

    for (const [name, attack] of Object.entries(attacks)) {
      it(`restores it when the page ${name}`, async () => {
        await page.goto(`${ORIGIN}/hostile/`);
        await expectFlagged();
        await page.evaluate(attack);
        await expect.poll(() => banner().count()).toBe(1);
        const shown = await page.locator('phisheck-banner').evaluate((host) => {
          const box = host.getBoundingClientRect();
          return {
            parent: host.parentElement === document.documentElement,
            attributes: host.getAttributeNames(),
            display: getComputedStyle(host).display,
            height: box.height > 0,
            title: host.shadowRoot?.querySelector('.title')?.textContent ?? '',
          };
        });
        expect(shown).toEqual({
          parent: true,
          attributes: ['style'],
          display: 'block',
          height: true,
          title: expect.stringMatching(/^Phisheck: likely phishing/),
        });
        expect(consoleErrors).toEqual([]);
      });
    }

    it(`gives up after ${MAX_RESTORES} restorations without hanging; the badge stays`, async () => {
      await page.goto(`${ORIGIN}/hostile/`);
      await expectFlagged();
      const removals = await page.evaluate(async () => {
        let count = 0;
        const kill = () => {
          const b = document.querySelector('phisheck-banner');
          if (b) {
            count++;
            b.remove();
          }
        };
        new MutationObserver(kill).observe(document.documentElement, { childList: true });
        kill();
        await new Promise((r) => setTimeout(r, 1_000));
        return count;
      });
      expect(removals).toBe(MAX_RESTORES + 1);
      expect(await bannerCount()).toBe(0);
      expect(await badgeText()).toBe('!');
      expect(consoleErrors).toEqual([]);
    });

    it('stays gone after Dismiss', async () => {
      await page.goto(`${ORIGIN}/hostile/`);
      await expectFlagged();
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await new Promise((r) => setTimeout(r, 500));
      expect(await bannerCount()).toBe(0);
      expect(consoleErrors).toEqual([]);
    });
  });
});
