/**
 * PLAN 4.14: the extension makes zero network requests (G2, D10, NFR privacy).
 *
 * 1. Static: the built bundles contain no network API and nothing that makes the browser load
 *    a URL; the manifest exposes no way for web pages to reach the extension.
 * 2. Differential E2E: the same browsing scenario runs in Chromium with and without the
 *    extension, and the sets of requested URLs must be identical. A canary request from the
 *    service worker first proves that the recorder sees requests made by the extension.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DIST,
  launchExtension,
  PAGES,
  servePages,
  settledTabState,
  type ExtensionSession,
} from './harness.js';

const NETWORK_APIS =
  /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|RTCPeerConnection|WebTransport|importScripts|Worker|SharedWorker)\b/g;
/** Ways a script can make the browser load a URL by itself. */
const URL_LOADERS =
  /url\(|new Image\b|\.src\s*=|createElement\("(?:img|script|link|iframe|audio|video|source|object|embed)"\)/g;

describe('static privacy check of extension/dist', () => {
  const scripts = readdirSync(DIST).filter((f) => f.endsWith('.js'));

  it('builds the expected bundles', () => {
    expect(scripts.sort()).toEqual(['background.js', 'content.js', 'popup.js', 'settings.js']);
  });

  it.each(['background.js', 'content.js', 'popup.js', 'settings.js'])(
    '%s uses no network API',
    (file) => {
      const code = readFileSync(join(DIST, file), 'utf8');
      expect(code.match(NETWORK_APIS) ?? []).toEqual([]);
      expect(code.match(URL_LOADERS) ?? []).toEqual([]);
    },
  );

  it('pages load no remote resources', () => {
    for (const file of readdirSync(DIST).filter((f) => /\.(html|css)$/.test(f))) {
      const text = readFileSync(join(DIST, file), 'utf8');
      expect(text.match(/https?:\/\//g) ?? [], file).toEqual([]);
      expect(text.match(/url\(/g) ?? [], file).toEqual([]);
    }
  });

  it('the manifest lets no web page connect and allows no remote code', () => {
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest).not.toHaveProperty('externally_connectable');
    expect(manifest).not.toHaveProperty('content_security_policy'); // MV3 default: no remote code
    expect(manifest).not.toHaveProperty('web_accessible_resources');
    expect(manifest).not.toHaveProperty('update_url');
  });
});

// The fixtures reference images, a stylesheet and a favicon, so the scenario also makes
// page-initiated requests; the comparison would notice if the extension added or changed any.
const SCENARIO_PAGES = {
  [PAGES.phishing.url]: PAGES.phishing.html,
  [PAGES.benign.url]: PAGES.benign.html,
};

async function runScenario(
  context: BrowserContext,
  withExtension?: ExtensionSession,
): Promise<string[]> {
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  await servePages(context, SCENARIO_PAGES);
  for (const url of [PAGES.phishing.url, PAGES.benign.url, PAGES.phishing.url]) {
    const page: Page = await context.newPage();
    await page.goto(url);
    if (withExtension) await settledTabState(withExtension, page, (s) => s.url === url);
    else await new Promise((r) => setTimeout(r, 1500));
    if (withExtension && url === PAGES.phishing.url) {
      await page.locator('phisheck-banner').waitFor({ state: 'attached', timeout: 15_000 });
    }
    await page.reload();
    await new Promise((r) => setTimeout(r, 1500));
    await page.close();
  }
  // Only web traffic matters: chrome-extension:// URLs are the extension reading its own files.
  return [...new Set(requests.filter((u) => /^https?:/.test(u)))].sort();
}

describe('no network requests at runtime', { timeout: 120_000 }, () => {
  let session: ExtensionSession | undefined;
  afterAll(async () => {
    await session?.close();
  });

  it('records requests made by the extension (canary)', async () => {
    session = await launchExtension();
    const seen: string[] = [];
    session.context.on('request', (r) => seen.push(r.url()));
    await servePages(session.context, {});
    await session.serviceWorker.evaluate(() =>
      fetch('https://canary.invalid/').catch(() => undefined),
    );
    await expect.poll(() => seen).toContain('https://canary.invalid/');
    await session.close();
    session = undefined;
  });

  it('requests exactly the same URLs as Chromium without the extension', async () => {
    session = await launchExtension();
    const withExtension = await runScenario(session.context, session);
    await session.close();
    session = undefined;

    const dir = mkdtempSync(join(tmpdir(), 'phisheck-plain-'));
    const plain = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      headless: true,
    });
    try {
      const without = await runScenario(plain);
      expect(withExtension).toEqual(without);
      expect(without.length).toBeGreaterThan(2); // the scenario did make page requests
    } finally {
      await plain.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
