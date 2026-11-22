import { describe, expect, it } from 'vitest';
import { LEXICAL_FEATURES, lexicalFeatures } from './url-lexical.js';
import { parseUrl } from './url-parts.js';

const lex = (url: string) => lexicalFeatures(parseUrl(url));

describe('lexicalFeatures', () => {
  it('computes every lexical feature', () => {
    expect(Object.keys(lex('https://example.com/')).sort()).toEqual([...LEXICAL_FEATURES].sort());
  });

  it('plain home page', () => {
    expect(lex('https://www.example.com/')).toEqual({
      url_length: 24,
      hostname_length: 15,
      path_length: 1,
      query_length: 0,
      num_dots: 2,
      num_hyphens: 0,
      num_hyphens_host: 0,
      num_digits: 0,
      num_digits_host: 0,
      num_underscores: 0,
      num_tildes: 0,
      num_ampersands: 0,
      num_percent: 0,
      num_at: 0,
      num_query_params: 0,
      path_depth: 0,
      has_double_slash_in_path: 0,
    });
  });

  it('IP host with a query', () => {
    expect(lex('http://192.168.0.1/login.php?user=a&id=42')).toEqual({
      url_length: 41,
      hostname_length: 11,
      path_length: 10,
      query_length: 12,
      num_dots: 4,
      num_hyphens: 0,
      num_hyphens_host: 0,
      num_digits: 10,
      num_digits_host: 8,
      num_underscores: 0,
      num_tildes: 0,
      num_ampersands: 1,
      num_percent: 0,
      num_at: 0,
      num_query_params: 2,
      path_depth: 1,
      has_double_slash_in_path: 0,
    });
  });

  it('phishing-style URL with every special character', () => {
    expect(
      lex('https://secure-login.paypal.com.verify-account.example.xyz/~user/a_b//c?x=%20&y=@'),
    ).toEqual({
      url_length: 81,
      hostname_length: 50,
      path_length: 13,
      query_length: 9,
      num_dots: 5,
      num_hyphens: 2,
      num_hyphens_host: 2,
      num_digits: 2,
      num_digits_host: 0,
      num_underscores: 1,
      num_tildes: 1,
      num_ampersands: 1,
      num_percent: 1,
      num_at: 1,
      num_query_params: 2,
      path_depth: 3,
      has_double_slash_in_path: 1,
    });
  });

  it.each([
    // url, expected subset
    ['https://example.com/a?', { query_length: 0, num_query_params: 0 }],
    ['https://example.com/?a&a&b=', { query_length: 6, num_query_params: 3 }],
    ['https://example.com:8080/', { url_length: 25, num_digits: 4, num_digits_host: 0 }],
    ['https://example.com/#a-b-c', { url_length: 20, num_hyphens: 0 }],
    ['https://münchen.de/', { hostname_length: 17, num_hyphens_host: 3, num_digits_host: 1 }],
    ['https://EXAMPLE.com/A/B/C/', { hostname_length: 11, path_depth: 3, path_length: 7 }],
    ['https://user@example.com/', { num_at: 1, hostname_length: 11 }],
    ['https://example.com/a b', { num_percent: 1, path_length: 6 }],
  ] as const)('%s', (url, subset) => {
    expect(lex(url)).toMatchObject(subset);
  });
});
