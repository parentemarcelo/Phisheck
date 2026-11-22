import { createSiteResolver, type ResolvedHref, type UrlParts } from './url-parts.js';

/** Everything a DOM feature group needs, built once per extraction. */
export interface DomContext {
  readonly doc: Document;
  /** The page URL (the argument to extract, not document.URL), already parsed. */
  readonly page: UrlParts;
  /** Resolves an attribute value against the page URL, caching site lookups. */
  readonly resolve: (href: string) => ResolvedHref | null;
}

export function createDomContext(doc: Document, page: UrlParts): DomContext {
  return { doc, page, resolve: createSiteResolver(page.url) };
}

/** Value / total, defined as 0 when total is 0 (a page without links has no external links). */
export function ratio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

/** URL without its fragment, for "same page" comparisons. */
export function withoutHash(url: URL): string {
  const i = url.href.indexOf('#');
  return i === -1 ? url.href : url.href.slice(0, i);
}
