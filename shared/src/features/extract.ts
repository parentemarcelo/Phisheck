import { createDomContext, type DomContext } from './dom-context.js';
import { formFeatures } from './dom-forms.js';
import { linkFeatures } from './dom-links.js';
import { miscFeatures } from './dom-misc.js';
import { resourceFeatures } from './dom-resources.js';
import {
  assembleVector,
  missingDomFeatures,
  type DomFeatures,
  type FeatureVector,
} from './schema.js';
import { urlFeatures } from './url-features.js';
import { parseUrl } from './url-parts.js';

/** All DOM features. The return type makes a missing group a compile error. */
export function domFeatures(ctx: DomContext): DomFeatures {
  return {
    ...linkFeatures(ctx),
    ...resourceFeatures(ctx),
    ...formFeatures(ctx),
    ...miscFeatures(ctx),
  };
}

/**
 * THE feature extractor, shared by the extension and the crawler.
 *
 * @param url  Absolute http(s) URL of the page (the tab URL / crawled final URL). It is the
 *             base for resolving links, independent of `doc.URL`.
 * @param doc  The page's DOM. Omit for URL-only mode: every DOM feature is then NaN.
 * @throws InvalidUrlError when `url` is not an absolute http(s) URL.
 *
 * Errors inside DOM processing propagate; callers decide whether to fall back to URL-only.
 */
export function extract(url: string, doc?: Document): FeatureVector {
  const page = parseUrl(url);
  const dom = doc === undefined ? missingDomFeatures() : domFeatures(createDomContext(doc, page));
  return assembleVector(urlFeatures(page), dom);
}
