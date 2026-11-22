import { foreignBrands } from './brands.js';
import type { DomContext } from './dom-context.js';
import type { DomFeatures } from './schema.js';

export const MISC_FEATURES = [
  'num_iframes',
  'has_hidden_iframe',
  'missing_title',
  'title_brand_mismatch',
  'login_brand_mismatch',
  'right_click_disabled',
] as const satisfies readonly (keyof DomFeatures)[];

export type MiscFeatures = Pick<DomFeatures, (typeof MISC_FEATURES)[number]>;

/**
 * Hidden-iframe detection uses attributes and inline styles only (no computed style), so the
 * live DOM in Chrome and a parsed snapshot give the same answer.
 */
const HIDDEN_STYLE =
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*[01](?:px)?\s*(?:!important)?\s*(?:;|$))/i;
const BLOCKS_MENU = /preventDefault|return\s+false/i;
/** Cap on text gathered for brand matching, to bound work on huge pages. */
const MAX_TEXT = 2000;

function isHiddenFrame(frame: Element): boolean {
  if (frame.hasAttribute('hidden')) return true;
  for (const dim of ['width', 'height']) {
    const value = frame.getAttribute(dim);
    if (value !== null && /^\s*[01](?:px)?\s*$/i.test(value)) return true;
  }
  return HIDDEN_STYLE.test(frame.getAttribute('style') ?? '');
}

function blocksContextMenu(doc: Document): boolean {
  for (const el of [doc.documentElement, doc.body]) {
    const handler = el?.getAttribute('oncontextmenu');
    if (handler != null && BLOCKS_MENU.test(handler)) return true;
  }
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const code = script.textContent ?? '';
    if (code.includes('contextmenu') && BLOCKS_MENU.test(code)) return true;
  }
  return false;
}

/** Text where a page presents its brand: title, top headings, image alt text, og:site_name. */
function brandText(doc: Document): string {
  const parts = [doc.title];
  for (const h of doc.querySelectorAll('h1, h2, h3')) parts.push(h.textContent ?? '');
  for (const img of doc.querySelectorAll('img[alt]')) parts.push(img.getAttribute('alt') ?? '');
  const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (site) parts.push(site);
  return parts.join(' ').slice(0, MAX_TEXT);
}

export function miscFeatures({ doc, page }: DomContext): MiscFeatures {
  const frames = doc.querySelectorAll('iframe, frame');
  const title = doc.title.trim();
  const hasPassword = [...doc.querySelectorAll('input[type]')].some(
    (i) => i.getAttribute('type')?.trim().toLowerCase() === 'password',
  );

  return {
    num_iframes: frames.length,
    has_hidden_iframe: [...frames].some(isHiddenFrame) ? 1 : 0,
    missing_title: title === '' ? 1 : 0,
    title_brand_mismatch: foreignBrands(title, page).length > 0 ? 1 : 0,
    login_brand_mismatch: hasPassword && foreignBrands(brandText(doc), page).length > 0 ? 1 : 0,
    right_click_disabled: blocksContextMenu(doc) ? 1 : 0,
  };
}
