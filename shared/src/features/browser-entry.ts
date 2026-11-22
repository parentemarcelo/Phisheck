/**
 * Entry point of the injectable browser bundle (dist/extractor.iife.js). Used by the crawler
 * (live and replay modes) and by the live-DOM parity test: after injection,
 * `globalThis.__phisheckExtract(url)` runs the shared extractor on the current document.
 *
 * Inject it WITHOUT adding a DOM node (Playwright `page.evaluate(bundle)` /
 * `addInitScript`, or an extension content script). Injecting it as an inline <script>
 * element would make its own source part of the page and corrupt DOM features
 * (e.g. right_click_disabled, which scans inline scripts).
 */
import { extract } from './extract.js';
import type { FeatureVector } from './schema.js';

declare global {
  var __phisheckExtract: (url?: string) => FeatureVector;
}

globalThis.__phisheckExtract = (url = document.URL) => extract(url, document);
