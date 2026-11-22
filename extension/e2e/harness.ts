/**
 * E2E harness: launches Playwright's Chromium with the unpacked extension (extension/dist,
 * rebuilt by vitest.global-setup.ts) in a fresh profile. Extensions need a persistent context
 * and the full Chromium build (`channel: 'chromium'`); the default headless shell can't load them.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';
import type { Settings } from '../src/common/settings.js';
import type { TabState } from '../src/common/tab-state.js';

export const DIST = fileURLToPath(new URL('../dist', import.meta.url));

export interface ExtensionSession {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  close: () => Promise<void>;
}

/** Launches Chromium with a fresh profile and the unpacked extension in `extensionDir`. */
export async function launchExtension(extensionDir = DIST): Promise<ExtensionSession> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'phisheck-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  // The 'serviceworker' event fires when the worker is created, possibly before its script has
  // run; navigations before then would be missed, so wait until the listeners exist.
  const deadline = Date.now() + 15_000;
  while (!(await serviceWorker.evaluate(() => chrome.webNavigation.onCommitted.hasListeners()))) {
    if (Date.now() > deadline) throw new Error('service worker did not register its listeners');
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    context,
    serviceWorker,
    extensionId: new URL(serviceWorker.url()).host,
    close: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8');

/**
 * Fixture pages and the URLs they are served at. Scores with the release model (jsdom,
 * which matches the live DOM): phishing ≈ 1.00, benign ≈ 0.12 — far from the 0.8 threshold.
 */
export const PAGES = {
  phishing: { url: 'http://paypal-account-verify.xyz/signin/', html: fixture('phishing.html') },
  benign: {
    url: 'https://riversidegarden.org/blog/spring-planting/',
    html: fixture('benign.html'),
  },
} as const;

/**
 * Serves `pages` (URL → HTML, fragment ignored) and aborts every other http(s) request, so tests
 * never touch the network yet can use realistic hostnames.
 */
export async function servePages(context: BrowserContext, pages: Record<string, string>) {
  // Only web traffic: the extension's own chrome-extension:// resources must still load.
  const isWeb = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:';
  await context.route(isWeb, (route) => {
    const html = pages[route.request().url().split('#')[0] ?? ''];
    return html === undefined
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
}

/**
 * Tab id of the open tab showing `page`. A tab closed just before may still be listed with the
 * same URL, so the newest matching tab (highest id) wins.
 */
export async function tabIdOf(session: ExtensionSession, page: Page): Promise<number> {
  const url = page.url();
  const id = await session.serviceWorker.evaluate(async (u) => {
    const ids = (await chrome.tabs.query({})).filter((t) => t.url === u).map((t) => t.id ?? -1);
    return ids.length > 0 ? Math.max(...ids) : undefined;
  }, url);
  if (id === undefined) throw new Error(`no tab shows ${url}`);
  return id;
}

/** The tab's state in chrome.storage.session (undefined if none). */
export function tabState(session: ExtensionSession, tabId: number): Promise<TabState | undefined> {
  return session.serviceWorker.evaluate(
    async (key) => (await chrome.storage.session.get(key))[key] as TabState | undefined,
    `tab:${tabId}`,
  );
}

/** Waits until the tab's analysis has finished (any status but pending) and returns it. */
export async function settledTabState(
  session: ExtensionSession,
  page: Page,
  isNew: (state: TabState) => boolean = () => true,
): Promise<TabState> {
  const tabId = await tabIdOf(session, page);
  const deadline = Date.now() + 15_000;
  for (;;) {
    const state = await tabState(session, tabId);
    if (state && state.status !== 'pending' && isNew(state)) return state;
    if (Date.now() > deadline) throw new Error(`analysis did not finish: ${JSON.stringify(state)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Writes extension settings directly (as the Settings page would). */
export function setSettings(session: ExtensionSession, settings: Partial<Settings>) {
  return session.serviceWorker.evaluate((s) => chrome.storage.local.set(s), settings);
}
