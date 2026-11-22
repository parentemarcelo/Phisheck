import { describe, expect, it } from 'vitest';
import { RESOURCE_FEATURES, resourceFeatures } from './dom-resources.js';
import { domContext } from './testing/dom.js';

const res = (head: string, body = '') =>
  resourceFeatures(domContext(`<html><head>${head}</head><body>${body}</body></html>`));

describe('resourceFeatures', () => {
  it('computes every resource feature', () => {
    expect(Object.keys(res('')).sort()).toEqual([...RESOURCE_FEATURES].sort());
  });

  it('returns zeros for a page without resources', () => {
    expect(res('<title>t</title>', '<p>text</p>')).toEqual({
      num_resources: 0,
      pct_ext_resources: 0,
      ext_favicon: 0,
    });
  });

  it('counts each resource kind and the share loaded from other sites', () => {
    const f = res(
      [
        '<link rel="stylesheet" href="/s.css">',
        '<link rel="stylesheet" href="https://cdn.other.net/s.css">',
        '<script src="app.js"></script>',
        '<script src="https://evil.example.org/x.js"></script>',
      ].join(''),
      [
        '<img src="//img.example.com/a.png">',
        '<img src="data:image/png;base64,AA==">',
        '<iframe src="https://frame.other.net/"></iframe>',
        '<img>',
        '<script>inline()</script>',
      ].join(''),
    );
    expect(f.num_resources).toBe(7);
    expect(f.pct_ext_resources).toBeCloseTo(3 / 7, 12);
  });

  it('includes <link href> only for resource-loading rels (the old app.py skipped all <link>)', () => {
    const f = res(
      [
        '<link rel="canonical" href="https://other.net/">',
        '<link rel="alternate" hreflang="de" href="https://other.de/">',
        '<link rel="preload" href="https://other.net/f.woff2" as="font">',
        '<link rel="manifest" href="/manifest.json">',
      ].join(''),
    );
    expect(f).toEqual({ num_resources: 2, pct_ext_resources: 0.5, ext_favicon: 0 });
  });

  it.each([
    ['<link rel="icon" href="/favicon.ico">', 0],
    ['<link rel="SHORTCUT ICON" href="https://paypalobjects.com/favicon.ico">', 1],
    ['<link rel="icon" href="data:image/x-icon;base64,AA==">', 0],
    ['<link rel="apple-touch-icon" href="https://other.net/a.png">', 0],
    ['<link rel="icon" href="/a.ico"><link rel="icon" href="https://other.net/b.ico">', 0],
  ])('favicon %s → %d', (head, expected) => {
    expect(res(head).ext_favicon).toBe(expected);
  });
});
