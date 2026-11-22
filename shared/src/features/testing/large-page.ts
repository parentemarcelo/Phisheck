// Test helper: a deliberately large page for performance tests (never used in production).

/** ~5k links, 500 forms/1000 inputs, 300 resources, 50 iframes, headings and inline scripts. */
export function largePageHtml(): string {
  const parts: string[] = ['<!doctype html><html><head><title>Big page</title>'];
  for (let i = 0; i < 150; i++) {
    const host = i % 3 === 0 ? 'https://cdn.other.net' : '';
    parts.push(`<link rel="stylesheet" href="${host}/css/${i}.css">`);
  }
  parts.push('</head><body>');
  for (let i = 0; i < 5000; i++) {
    const href =
      i % 5 === 0 ? `https://site${i % 97}.example.org/p/${i}` : i % 7 === 0 ? '#' : `/page/${i}`;
    parts.push(`<p><a href="${href}">link ${i}</a></p>`);
  }
  for (let i = 0; i < 500; i++) {
    parts.push(
      `<form action="/submit/${i}"><input name="a${i}"><input type="hidden" name="h${i}"></form>`,
    );
  }
  for (let i = 0; i < 150; i++) parts.push(`<img src="/img/${i}.png" alt="image ${i}">`);
  for (let i = 0; i < 50; i++) parts.push(`<iframe src="/frame/${i}" width="300"></iframe>`);
  for (let i = 0; i < 100; i++) parts.push(`<h2>Section ${i}</h2>`);
  for (let i = 0; i < 20; i++) parts.push(`<script>var x${i} = ${i};</script>`);
  parts.push('</body></html>');
  return parts.join('\n');
}
