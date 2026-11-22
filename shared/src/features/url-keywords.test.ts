import { describe, expect, it } from 'vitest';
import { BRANDS, countSensitiveWords, findBrands } from './brands.js';
import { KEYWORD_FEATURES, keywordFeatures } from './url-keywords.js';
import { parseUrl } from './url-parts.js';

const kw = (url: string) => keywordFeatures(parseUrl(url));
const names = (text: string) => findBrands(text).map((b) => b.name);

describe('findBrands', () => {
  it('matches distinctive tokens as substrings', () => {
    expect(names('paypalsecure-update')).toEqual(['paypal']);
    expect(names('my-ONEDRIVE-share')).toEqual(['microsoft']);
  });

  it('matches common words only as whole tokens', () => {
    expect(names('purchase-history')).toEqual([]);
    expect(names('chase-online')).toEqual(['chase']);
    expect(names('pineapple')).toEqual([]);
    expect(names('apple id')).toEqual(['apple']);
    expect(names('groups and backups')).toEqual([]);
    expect(names('ups tracking')).toEqual(['ups']);
  });

  it('finds several brands', () => {
    expect(names('PayPal and Netflix')).toEqual(['paypal', 'netflix']);
  });

  it('has lower-case, unique brand definitions', () => {
    expect(new Set(BRANDS.map((b) => b.name)).size).toBe(BRANDS.length);
    for (const b of BRANDS) {
      for (const s of [...b.tokens, ...b.words, ...b.official]) expect(s).toBe(s.toLowerCase());
      expect(b.tokens.length + b.words.length).toBeGreaterThan(0);
    }
  });
});

describe('countSensitiveWords', () => {
  it('counts distinct words once, case-insensitively', () => {
    expect(countSensitiveWords('https://example.com/')).toBe(0);
    expect(countSensitiveWords('/LOGIN/login/verify-account')).toBe(3);
    expect(countSensitiveWords('/verification')).toBe(1);
  });
});

describe('keywordFeatures', () => {
  it('computes every keyword feature', () => {
    expect(Object.keys(kw('https://example.com/')).sort()).toEqual([...KEYWORD_FEATURES].sort());
  });

  it.each([
    // The official site: no impersonation.
    [
      'https://www.paypal.com/signin',
      { brand_outside_registered_domain: 0, brand_in_path: 0, num_sensitive_words: 1 },
    ],
    ['https://www.paypal.co.uk/', { brand_outside_registered_domain: 0 }],
    [
      'https://login.microsoftonline.com/common/oauth2',
      { brand_outside_registered_domain: 0, num_sensitive_words: 1 },
    ],
    // Brand in the hostname of an unrelated registrable domain.
    ['https://paypal-login.example.xyz/', { brand_outside_registered_domain: 1 }],
    [
      'https://www.paypal.com.verify-account.example.xyz/',
      { brand_outside_registered_domain: 1, num_sensitive_words: 2 },
    ],
    ['https://paypal-secure.com/', { brand_outside_registered_domain: 1 }],
    // Suffix-restricted brands: official only on their own suffixes.
    ['https://www.roblox.com/home', { brand_outside_registered_domain: 0 }],
    ['https://www.roblox.com.kz/users/1/profile', { brand_outside_registered_domain: 1 }],
    ['https://roblox.ly/users/1/profile', { brand_outside_registered_domain: 1 }],
    ['https://wvvw--roblox.com/users/1', { brand_outside_registered_domain: 1 }],
    ['https://www.hmrc.gov.uk/', { brand_outside_registered_domain: 0 }],
    ['https://www.irsgov.eu.cc/', { brand_outside_registered_domain: 1 }],
    ['https://tik-tok-18-3.cc/', { brand_outside_registered_domain: 1 }],
    // Global brands stay official on country suffixes.
    ['https://www.amazon.co.uk/', { brand_outside_registered_domain: 0 }],
    // Private suffixes are never official, even with the brand label.
    ['https://paypal.github.io/', { brand_outside_registered_domain: 1 }],
    // Brand in the path of an unrelated domain (typical of compromised sites).
    [
      'https://blog.example.com/wp-content/paypal/login.php',
      { brand_outside_registered_domain: 0, brand_in_path: 1, num_sensitive_words: 1 },
    ],
    ['https://example.com/%50ay%50al/', { brand_in_path: 1 }],
    ['https://example.com/a?next=netflix', { brand_in_path: 1 }],
    ['https://www.paypal.com/paypal/help', { brand_in_path: 0 }],
    // Broken percent-encoding must not throw.
    ['https://example.com/%E0%A4%A/paypal', { brand_in_path: 1 }],
    [
      'https://example.com/',
      { num_sensitive_words: 0, brand_outside_registered_domain: 0, brand_in_path: 0 },
    ],
  ] as const)('%s', (url, subset) => {
    expect(kw(url)).toMatchObject(subset);
  });
});
