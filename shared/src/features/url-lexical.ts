import type { UrlFeatures } from './schema.js';
import type { UrlParts } from './url-parts.js';

export const LEXICAL_FEATURES = [
  'url_length',
  'hostname_length',
  'path_length',
  'query_length',
  'num_dots',
  'num_hyphens',
  'num_hyphens_host',
  'num_digits',
  'num_digits_host',
  'num_underscores',
  'num_tildes',
  'num_ampersands',
  'num_percent',
  'num_at',
  'num_query_params',
  'path_depth',
  'has_double_slash_in_path',
] as const satisfies readonly (keyof UrlFeatures)[];

export type LexicalFeatures = Pick<UrlFeatures, (typeof LEXICAL_FEATURES)[number]>;

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

function countDigits(text: string): number {
  let n = 0;
  for (const c of text) if (c >= '0' && c <= '9') n++;
  return n;
}

/** Character/length statistics of the normalised URL (fragment excluded). */
export function lexicalFeatures(parts: UrlParts): LexicalFeatures {
  const { href, hostname, url } = parts;
  const path = url.pathname;
  const query = url.search.startsWith('?') ? url.search.slice(1) : url.search;

  return {
    url_length: href.length,
    hostname_length: hostname.length,
    path_length: path.length,
    query_length: query.length,
    num_dots: countChar(href, '.'),
    num_hyphens: countChar(href, '-'),
    num_hyphens_host: countChar(hostname, '-'),
    num_digits: countDigits(href),
    num_digits_host: countDigits(hostname),
    num_underscores: countChar(href, '_'),
    num_tildes: countChar(href, '~'),
    num_ampersands: countChar(href, '&'),
    num_percent: countChar(href, '%'),
    num_at: countChar(href, '@'),
    num_query_params: [...url.searchParams.keys()].length,
    path_depth: path.split('/').filter((s) => s !== '').length,
    has_double_slash_in_path: path.includes('//') ? 1 : 0,
  };
}
