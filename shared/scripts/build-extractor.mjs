// Builds the injectable extractor bundle: shared/dist/extractor.iife.js
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  entryPoints: [`${root}src/features/browser-entry.ts`],
  outfile: `${root}dist/extractor.iife.js`,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('built shared/dist/extractor.iife.js');
