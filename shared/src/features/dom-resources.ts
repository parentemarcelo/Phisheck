import { ratio, type DomContext } from './dom-context.js';
import type { DomFeatures } from './schema.js';

export const RESOURCE_FEATURES = [
  'num_resources',
  'pct_ext_resources',
  'ext_favicon',
] as const satisfies readonly (keyof DomFeatures)[];

export type ResourceFeatures = Pick<DomFeatures, (typeof RESOURCE_FEATURES)[number]>;

/** <link rel> tokens that make the browser load a resource. */
const RESOURCE_RELS = new Set([
  'stylesheet',
  'icon',
  'apple-touch-icon',
  'preload',
  'modulepreload',
  'manifest',
]);

function relTokens(el: Element): string[] {
  return (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Resources = img/script/iframe/frame[src] plus <link href> with a loading rel.
 * External = http(s) from another registrable domain; data:/blob: and unparseable URLs are
 * not external. The favicon is the first <link> whose rel contains "icon".
 */
export function resourceFeatures({ doc, page, resolve }: DomContext): ResourceFeatures {
  const isExternal = (value: string | null): boolean => {
    if (value === null || value.trim() === '') return false;
    const resolved = resolve(value.trim());
    return resolved?.site != null && resolved.site !== page.site;
  };

  let total = 0;
  let external = 0;
  for (const el of doc.querySelectorAll('img[src], script[src], iframe[src], frame[src]')) {
    total++;
    if (isExternal(el.getAttribute('src'))) external++;
  }

  let favicon: Element | undefined;
  for (const el of doc.querySelectorAll('link[href]')) {
    const rels = relTokens(el);
    if (!rels.some((r) => RESOURCE_RELS.has(r))) continue;
    total++;
    if (isExternal(el.getAttribute('href'))) external++;
    if (favicon === undefined && rels.includes('icon')) favicon = el;
  }

  return {
    num_resources: total,
    pct_ext_resources: ratio(external, total),
    ext_favicon: favicon !== undefined && isExternal(favicon.getAttribute('href')) ? 1 : 0,
  };
}
