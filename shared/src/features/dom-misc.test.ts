import { describe, expect, it } from 'vitest';
import { MISC_FEATURES, miscFeatures } from './dom-misc.js';
import { domContext } from './testing/dom.js';

const misc = (html: string, url = 'https://www.example.com/') =>
  miscFeatures(domContext(html, url));
const page = (title: string, body = '') =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`;

describe('miscFeatures', () => {
  it('computes every misc feature', () => {
    expect(Object.keys(misc(page('t'))).sort()).toEqual([...MISC_FEATURES].sort());
  });

  it('returns zeros for a plain page', () => {
    expect(misc(page('Welcome', '<p>Hello</p>'))).toEqual({
      num_iframes: 0,
      has_hidden_iframe: 0,
      missing_title: 0,
      title_brand_mismatch: 0,
      login_brand_mismatch: 0,
      right_click_disabled: 0,
    });
  });

  describe('iframes', () => {
    it('counts iframes and frames', () => {
      expect(misc(page('t', '<iframe src="/a"></iframe><iframe></iframe>')).num_iframes).toBe(2);
      expect(
        misc('<html><frameset><frame src="/a"><frame src="/b"></frameset></html>').num_iframes,
      ).toBe(2);
    });

    it.each([
      ['<iframe hidden src="/x"></iframe>', 1],
      ['<iframe width="0" height="0" src="/x"></iframe>', 1],
      ['<iframe width="1" height="1" src="/x"></iframe>', 1],
      ['<iframe height="0px" src="/x"></iframe>', 1],
      ['<iframe style="display: none" src="/x"></iframe>', 1],
      ['<iframe style="border:0;VISIBILITY:hidden" src="/x"></iframe>', 1],
      ['<iframe style="width:0; height:0" src="/x"></iframe>', 1],
      ['<iframe style="height:1px !important" src="/x"></iframe>', 1],
      ['<iframe width="600" height="400" src="/x"></iframe>', 0],
      ['<iframe width="100" style="width:10px;max-height:0" src="/x"></iframe>', 0],
      ['<iframe style="width:100%" src="/x"></iframe>', 0],
    ])('%s → %d', (body, expected) => {
      expect(misc(page('t', body)).has_hidden_iframe).toBe(expected);
    });
  });

  it('flags missing or blank titles', () => {
    expect(misc('<html><head></head><body></body></html>').missing_title).toBe(1);
    expect(misc(page('   ')).missing_title).toBe(1);
  });

  describe('brand mismatch', () => {
    it('flags a title naming a brand on a foreign domain', () => {
      expect(
        misc(page('PayPal: Log in'), 'https://secure-check.example.xyz/').title_brand_mismatch,
      ).toBe(1);
      expect(
        misc(page('PayPal: Log in'), 'https://www.paypal.com/signin').title_brand_mismatch,
      ).toBe(0);
      expect(misc(page('Purchase history')).title_brand_mismatch).toBe(0);
    });

    const pw = '<form><input type="password"></form>';
    it.each([
      ['title', page('Microsoft account', pw), 1],
      ['heading', page('Sign in', `<h2>Sign in to Netflix</h2>${pw}`), 1],
      ['img alt', page('Sign in', `<img alt="DHL logo">${pw}`), 1],
      [
        'og:site_name',
        `<html><head><meta property="og:site_name" content="Dropbox"></head><body>${pw}</body></html>`,
        1,
      ],
      ['no password field', page('Microsoft account', '<form><input type="text"></form>'), 0],
      ['no brand', page('Members area', pw), 0],
    ])('login form + brand via %s', (_label, html, expected) => {
      expect(misc(html, 'https://login.example.xyz/').login_brand_mismatch).toBe(expected);
    });

    it('does not flag the brand on its own site', () => {
      expect(misc(page('Netflix', pw), 'https://www.netflix.com/login').login_brand_mismatch).toBe(
        0,
      );
    });
  });

  describe('right click', () => {
    it.each([
      ['<html><body oncontextmenu="return false"></body></html>', 1],
      ['<html oncontextmenu="event.preventDefault()"><body></body></html>', 1],
      [
        page(
          't',
          '<script>document.addEventListener("contextmenu", e => e.preventDefault());</script>',
        ),
        1,
      ],
      [page('t', '<script>document.oncontextmenu = function () { return false; };</script>'), 1],
      [page('t', '<script>form.addEventListener("submit", e => e.preventDefault());</script>'), 0],
      [page('t', '<script src="/contextmenu.js"></script>'), 0],
      [page('t', '<body oncontextmenu="showMenu()"></body>'), 0],
    ])('%s → %d', (html, expected) => {
      expect(misc(html).right_click_disabled).toBe(expected);
    });
  });
});
