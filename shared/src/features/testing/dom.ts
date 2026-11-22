// Test and tooling helpers only — never imported by production code.
import { createRequire } from 'node:module';
import { JSDOM, type ConstructorOptions } from 'jsdom';
import { createDomContext, type DomContext } from '../dom-context.js';
import { parseUrl } from '../url-parts.js';

// jsdom internals (jsdom is pinned; the live-DOM parity test guards this): the wrapper → impl
// mapping and the HTML parser entry point.
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper: (wrapper: Document) => { _parseOptions: { scriptingEnabled?: boolean } };
};
const { parseIntoDocument } = require('jsdom/lib/jsdom/browser/parser/index.js') as {
  parseIntoDocument: (markup: string, document: unknown) => void;
};

/**
 * Parses `html` as served at `url` into a jsdom window, building the same tree as Chromium.
 *
 * Browsers parse with the scripting flag on, so <noscript> content is raw text, never
 * elements, and a <noscript> in <head> doesn't end the head. jsdom only sets that flag when it
 * also runs the page's scripts (`runScripts: 'dangerously'`), which untrusted HTML must never
 * do. So the document is parsed with the flag set directly: it changes only how the HTML is
 * parsed. Scripts and event handlers still never run (`runScripts` is at most 'outside-only').
 */
export function htmlWindow(
  html: string,
  url = 'https://www.example.com/page.html',
  options: Omit<ConstructorOptions, 'url' | 'runScripts'> & { runScripts?: 'outside-only' } = {},
): JSDOM {
  const dom = new JSDOM('', { ...options, url });
  const doc = dom.window.document;
  implForWrapper(doc)._parseOptions.scriptingEnabled = true;
  while (doc.firstChild) doc.firstChild.remove();
  parseIntoDocument(html, implForWrapper(doc));
  return dom;
}

/** The document of `htmlWindow` (scripts are NOT executed). */
export function htmlDocument(
  html: string,
  url = 'https://www.example.com/page.html',
  options: Omit<ConstructorOptions, 'url' | 'runScripts'> = {},
): Document {
  return htmlWindow(html, url, options).window.document;
}

export function domContext(html: string, url = 'https://www.example.com/page.html'): DomContext {
  return createDomContext(htmlDocument(html, url), parseUrl(url));
}
