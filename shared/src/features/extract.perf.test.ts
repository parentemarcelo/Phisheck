import { describe, expect, it } from 'vitest';
import { extract } from './extract.js';
import { htmlDocument } from './testing/dom.js';
import { largePageHtml } from './testing/large-page.js';

const URL = 'https://www.example.com/big';
const RUNS = 15;
/** PLAN 1.11 / IDEA §7 budget. jsdom is slower than Chrome, so passing here is conservative. */
const BUDGET_MS = 50;

describe('extract performance', () => {
  it(`median extraction on a large page is under ${BUDGET_MS} ms`, () => {
    const doc = htmlDocument(largePageHtml(), URL);
    expect(doc.querySelectorAll('a[href]')).toHaveLength(5000);
    extract(URL, doc); // warm-up (JIT, caches)

    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      extract(URL, doc);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(RUNS / 2)] ?? Number.POSITIVE_INFINITY;
    console.info(`extract median ${median.toFixed(1)} ms (min ${times[0]?.toFixed(1)} ms)`);
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
