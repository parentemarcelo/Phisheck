import { ratio, withoutHash, type DomContext } from './dom-context.js';
import type { DomFeatures } from './schema.js';

export const LINK_FEATURES = [
  'num_links',
  'pct_ext_links',
  'pct_null_links',
  'pct_self_links',
] as const satisfies readonly (keyof DomFeatures)[];

export type LinkFeatures = Pick<DomFeatures, (typeof LINK_FEATURES)[number]>;

const JAVASCRIPT_HREF = /^javascript:/i;

/**
 * Classifies every <a href>:
 * - null: "", "#", or javascript: (any form, e.g. "javascript:void(0)");
 * - self: resolves (relative links included) to this page, ignoring the fragment;
 * - external: http(s) link whose registrable domain differs from the page's.
 * Other links (same-site pages, mailto:, tel:, unparseable) only count in the total.
 */
export function linkFeatures({ doc, page, resolve }: DomContext): LinkFeatures {
  const links = doc.querySelectorAll('a[href]');
  let external = 0;
  let nulls = 0;
  let self = 0;

  for (const link of links) {
    const raw = (link.getAttribute('href') ?? '').trim();
    if (raw === '' || raw === '#' || JAVASCRIPT_HREF.test(raw)) {
      nulls++;
      continue;
    }
    const resolved = resolve(raw);
    if (resolved === null || resolved.site === null) continue;
    if (resolved.site !== page.site) external++;
    else if (withoutHash(resolved.url) === page.href) self++;
  }

  const total = links.length;
  return {
    num_links: total,
    pct_ext_links: ratio(external, total),
    pct_null_links: ratio(nulls, total),
    pct_self_links: ratio(self, total),
  };
}
