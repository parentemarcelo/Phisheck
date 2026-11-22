// Test helpers: the HTML fixture pages in shared/fixtures/pages (never used in production).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../../../fixtures/pages/', import.meta.url));

export interface PageFixture {
  readonly file: string;
  /** URL the page is served at (the extractor's page URL). */
  readonly url: string;
  readonly html: string;
}

export function loadPageFixtures(): PageFixture[] {
  const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')) as {
    file: string;
    url: string;
  }[];
  return manifest.map(({ file, url }) => ({ file, url, html: readFileSync(dir + file, 'utf8') }));
}

/** Path of the built browser bundle (run `npm run build -w shared` first). */
export const EXTRACTOR_BUNDLE = fileURLToPath(
  new URL('../../../dist/extractor.iife.js', import.meta.url),
);
