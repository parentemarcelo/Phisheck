import type { UrlFeatures } from './schema.js';
import { hostFeatures } from './url-host.js';
import { keywordFeatures } from './url-keywords.js';
import { lexicalFeatures } from './url-lexical.js';
import type { UrlParts } from './url-parts.js';

/** All URL features. The return type makes a missing group a compile error. */
export function urlFeatures(parts: UrlParts): UrlFeatures {
  return { ...lexicalFeatures(parts), ...hostFeatures(parts), ...keywordFeatures(parts) };
}
