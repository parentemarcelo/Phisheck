/**
 * PLAN 1.12 — live-DOM parity: the injected bundle running on Chromium's live DOM must give
 * exactly the features jsdom gives for the same HTML. This guards the single-extractor
 * invariant (training-data crawler and extension in Chromium vs. tests and tooling in jsdom).
 *
 * Needs Playwright's Chromium: `npx playwright install chromium`.
 */
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extract } from './extract.js';
import { vectorToRecord, type FeatureVector } from './schema.js';
import { htmlDocument } from './testing/dom.js';
import { EXTRACTOR_BUNDLE, loadPageFixtures } from './testing/fixtures.js';
import { largePageHtml } from './testing/large-page.js';

let browser: Browser;
let bundle: string;

beforeAll(async () => {
  bundle = readFileSync(EXTRACTOR_BUNDLE, 'utf8');
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/** Serves `html` at `url` and aborts every other request (no network access at all). */
async function openPage(url: string, html: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.request().url() === url
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
  await page.goto(url, { waitUntil: 'load' });
  // Inject without adding a <script> element (see browser-entry.ts).
  await page.evaluate(bundle);
  return page;
}

describe('live-DOM parity (Chromium vs jsdom)', () => {
  it.each(loadPageFixtures().map((f) => [f.file, f] as const))(
    '%s',
    async (_, f) => {
      const page = await openPage(f.url, f.html);
      try {
        const live = await page.evaluate((u) => globalThis.__phisheckExtract(u), f.url);
        // Compare as name → value records so a failure names the differing features.
        expect(vectorToRecord(live)).toEqual(
          vectorToRecord(extract(f.url, htmlDocument(f.html, f.url))),
        );
      } finally {
        await page.context().close();
      }
    },
    30_000,
  );

  it('extracts the large page in under 50 ms (median) in Chromium', async () => {
    const url = 'https://www.example.com/big';
    const page = await openPage(url, largePageHtml());
    try {
      const median = await page.evaluate((u) => {
        const times: number[] = [];
        globalThis.__phisheckExtract(u); // warm-up
        for (let i = 0; i < 15; i++) {
          const start = performance.now();
          const v: FeatureVector = globalThis.__phisheckExtract(u);
          times.push(performance.now() - start);
          if (v.values.length === 0) throw new Error('empty vector');
        }
        times.sort((a, b) => a - b);
        return times[7] ?? Number.POSITIVE_INFINITY;
      }, url);
      console.info(`Chromium extract median ${median.toFixed(1)} ms`);
      expect(median).toBeLessThan(50);
    } finally {
      await page.context().close();
    }
  }, 60_000);
});
