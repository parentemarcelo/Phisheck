import { describe, expect, it } from 'vitest';
import { htmlDocument, htmlWindow } from './dom.js';

const HOSTILE = `<html><head>
<noscript><img src="https://px.example/a"><link rel="stylesheet" href="https://cdn.example/a.css"></noscript>
<script src="https://cdn.example/after.js"></script></head><body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>
<script>window.ran = true</script>
<img src="x" onerror="window.handler = true"><div id="d" onclick="window.clicked = true"></div>
</body></html>`;

describe('htmlWindow / htmlDocument (jsdom parsed like Chromium)', () => {
  it('parses <noscript> content as text, in <head> and <body>, like a browser', () => {
    const doc = htmlDocument(HOSTILE, 'https://a.example/');
    expect(doc.querySelectorAll('iframe')).toHaveLength(0);
    expect(doc.querySelectorAll('link')).toHaveLength(0);
    expect(doc.querySelectorAll('img')).toHaveLength(1); // only the one outside <noscript>
    expect(doc.head.querySelectorAll('script[src]')).toHaveLength(1); // head not cut short
    expect(doc.URL).toBe('https://a.example/');
  });

  it('never runs page scripts or event handlers', async () => {
    for (const options of [{}, { runScripts: 'outside-only' as const }]) {
      const dom = htmlWindow(HOSTILE, 'https://a.example/', options);
      dom.window.document.getElementById('d')?.click();
      await new Promise((r) => setTimeout(r, 50));
      const w = dom.window as unknown as Record<string, unknown>;
      expect([w.ran, w.handler, w.clicked]).toEqual([undefined, undefined, undefined]);
      dom.window.close();
    }
  });
});
