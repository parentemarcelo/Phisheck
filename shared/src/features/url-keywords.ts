import { countSensitiveWords, foreignBrands } from './brands.js';
import type { UrlFeatures } from './schema.js';
import type { UrlParts } from './url-parts.js';

export const KEYWORD_FEATURES = [
  'num_sensitive_words',
  'brand_outside_registered_domain',
  'brand_in_path',
] as const satisfies readonly (keyof UrlFeatures)[];

export type KeywordFeatures = Pick<UrlFeatures, (typeof KEYWORD_FEATURES)[number]>;

/** Sensitive words and brand impersonation signals in the URL. */
export function keywordFeatures(parts: UrlParts): KeywordFeatures {
  const pathAndQuery = parts.url.pathname + parts.url.search;
  return {
    num_sensitive_words: countSensitiveWords(parts.href),
    brand_outside_registered_domain: foreignBrands(parts.hostname, parts).length > 0 ? 1 : 0,
    // Decode so "%70aypal" or "/PayPal%20Login" still match; fall back to the raw text.
    brand_in_path: foreignBrands(safeDecode(pathAndQuery), parts).length > 0 ? 1 : 0,
  };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
