import { describe, expect, it } from 'vitest';
import { LINK_FEATURES, linkFeatures } from './dom-links.js';
import { createDomContext } from './dom-context.js';
import { domContext, htmlDocument } from './testing/dom.js';
import { parseUrl } from './url-parts.js';

const PAGE = 'https://www.example.com/dir/page.html';
const links = (body: string, url = PAGE) => linkFeatures(domContext(`<body>${body}</body>`, url));
const a = (href: string) => `<a href="${href}">x</a>`;

describe('linkFeatures', () => {
  it('computes every link feature', () => {
    expect(Object.keys(links('')).sort()).toEqual([...LINK_FEATURES].sort());
  });

  it('returns zeros for a page without links', () => {
    expect(links('<a>no href</a>')).toEqual({
      num_links: 0,
      pct_ext_links: 0,
      pct_null_links: 0,
      pct_self_links: 0,
    });
  });

  it('treats relative and same-site links as internal (the old app.py counted them external)', () => {
    const f = links(
      [
        a('/login'),
        a('other.html'),
        a('../up.html'),
        a('//cdn.example.com/x'),
        a('https://shop.example.com/'),
      ].join(''),
    );
    expect(f).toEqual({ num_links: 5, pct_ext_links: 0, pct_null_links: 0, pct_self_links: 0 });
  });

  it('counts links to another registrable domain as external', () => {
    const f = links(
      [a('https://evil.example.net/'), a('http://10.0.0.1/'), a('/home'), a('page2.html')].join(''),
    );
    expect(f.pct_ext_links).toBe(0.5);
  });

  it('detects null links, including real javascript:void(0) forms', () => {
    const f = links(
      [a(''), a('#'), a(' # '), a('javascript:void(0)'), a('JavaScript:void(0);'), a('/ok')].join(
        '',
      ),
    );
    expect(f.num_links).toBe(6);
    expect(f.pct_null_links).toBeCloseTo(5 / 6, 12);
  });

  it('detects self links that resolve to the current page', () => {
    const f = links(
      [a('#top'), a('page.html'), a(PAGE), a(`${PAGE}#x`), a('/dir/other.html')].join(''),
    );
    expect(f.pct_self_links).toBe(4 / 5);
    expect(f.pct_null_links).toBe(0);
  });

  it('counts mailto:, tel: and malformed links only in the total', () => {
    const f = links(
      [a('mailto:a@b.c'), a('tel:+123'), a('http://[bad'), a('https://evil.example.net/')].join(''),
    );
    expect(f).toEqual({ num_links: 4, pct_ext_links: 0.25, pct_null_links: 0, pct_self_links: 0 });
  });

  it('uses the page URL argument, not the document location, as the base', () => {
    const doc = htmlDocument(
      `<body>${a('/x')}${a('https://www.example.com/')}</body>`,
      'https://other.test/',
    );
    const f = linkFeatures(createDomContext(doc, parseUrl('https://phish.example.org/')));
    // Against the page URL, "/x" is internal; against the document URL it would be external.
    expect(f.pct_ext_links).toBe(0.5);
  });
});
