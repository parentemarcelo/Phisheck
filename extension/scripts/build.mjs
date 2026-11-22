// Builds the unpacked MV3 extension into extension/dist/ (PLAN 4.1).
// Usage: node extension/scripts/build.mjs [--watch]
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist/`;
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// The manifest version follows extension/package.json so there is one place to bump it.
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
manifest.version = pkg.version;
writeFileSync(`${dist}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

for (const page of [
  'popup/popup.html',
  'popup/popup.css',
  'settings/settings.html',
  'settings/settings.css',
]) {
  cpSync(`${root}src/${page}`, `${dist}${page.split('/')[1]}`);
}
mkdirSync(`${dist}icons`);
for (const size of [16, 32, 48, 128]) {
  cpSync(`${root}icons/icon${size}.png`, `${dist}icons/icon${size}.png`);
}

// `import model from 'phisheck-model'` bundles the release model (see src/model.d.ts).
const modelPlugin = {
  name: 'phisheck-model',
  setup(b) {
    b.onResolve({ filter: /^phisheck-model$/ }, () => ({ path: `${root}../models/model.json` }));
  },
};

const common = {
  plugins: [modelPlugin],
  bundle: true,
  platform: 'browser',
  target: ['chrome120'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
};

const entries = [
  { in: 'background/index.ts', out: 'background.js', format: 'esm' },
  { in: 'content/index.ts', out: 'content.js', format: 'iife' },
  { in: 'popup/index.ts', out: 'popup.js', format: 'iife' },
  { in: 'settings/index.ts', out: 'settings.js', format: 'iife' },
];

const options = entries.map((e) => ({
  ...common,
  entryPoints: [`${root}src/${e.in}`],
  outfile: `${dist}${e.out}`,
  format: e.format,
}));

if (process.argv.includes('--watch')) {
  for (const o of options) await (await context(o)).watch();
  console.log('watching extension/src → extension/dist');
} else {
  await Promise.all(options.map((o) => build(o)));
  console.log('built extension/dist');
}
