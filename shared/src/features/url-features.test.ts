import { describe, expect, it } from 'vitest';
import { URL_FEATURE_NAMES } from './schema.js';
import { urlFeatures } from './url-features.js';
import { parseUrl } from './url-parts.js';

describe('urlFeatures', () => {
  it('returns exactly the URL features of the schema, all finite numbers', () => {
    const f = urlFeatures(parseUrl('https://paypal-login.example.xyz:8080/a//b?x=1&y=2'));
    expect(Object.keys(f).sort()).toEqual([...URL_FEATURE_NAMES].sort());
    for (const v of Object.values(f)) expect(Number.isFinite(v)).toBe(true);
  });
});
