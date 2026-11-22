import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extract } from './extract.js';
import type { FeatureVector } from './schema.js';
import { htmlDocument, htmlWindow } from './testing/dom.js';
import { EXTRACTOR_BUNDLE, loadPageFixtures } from './testing/fixtures.js';

const fixtures = loadPageFixtures();

describe('browser bundle (in jsdom)', () => {
  it('has been built', () => {
    expect(existsSync(EXTRACTOR_BUNDLE), 'run: npm run build -w shared').toBe(true);
  });

  it.each(fixtures.map((f) => [f.file, f] as const))('%s: bundle === direct extract', (_, f) => {
    const dom = htmlWindow(f.html, f.url, { runScripts: 'outside-only' });
    dom.window.eval(readFileSync(EXTRACTOR_BUNDLE, 'utf8'));
    const fromBundle = (
      dom.window as unknown as { __phisheckExtract: (url: string) => FeatureVector }
    ).__phisheckExtract(f.url);
    expect(fromBundle).toEqual(extract(f.url, htmlDocument(f.html, f.url)));
  });
});
