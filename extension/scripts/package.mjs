// Release package (PLAN 5.7): builds the extension and zips extension/dist into
// release/phisheck-<version>.zip, the file uploaded to the Chrome Web Store.
// Usage: node extension/scripts/package.mjs [--no-build] [--out <dir>]
//   --no-build  zip the current dist/ as it is (used by the E2E test, which builds first)
//   --out       output directory (default: release/ at the repository root)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

const ext = fileURLToPath(new URL('..', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = `${ext}dist`;
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : `${root}release`;
if (out === undefined) throw new Error('--out needs a directory');

if (!args.includes('--no-build')) {
  execFileSync(process.execPath, [`${ext}scripts/build.mjs`], { stdio: 'inherit' });
}

const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => {
    const path = join(d.parentPath, d.name);
    return { name: relative(dist, path).split(sep).join('/'), data: readFileSync(path) };
  });
const manifest = JSON.parse(readFileSync(`${dist}/manifest.json`, 'utf8'));
const { version } = JSON.parse(readFileSync(`${ext}package.json`, 'utf8'));
if (manifest.version !== version) {
  throw new Error(`dist/ is stale: manifest ${manifest.version}, package.json ${version}`);
}

const zip = writeZip(files);
mkdirSync(out, { recursive: true });
const target = join(out, `phisheck-${version}.zip`);
writeFileSync(target, zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
console.log(
  `${relative(process.cwd(), target) || target}: ${files.length} files, ` +
    `${(zip.length / 1024).toFixed(0)} KB, sha256 ${sha256}`,
);
