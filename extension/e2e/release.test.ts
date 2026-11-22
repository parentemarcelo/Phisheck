// PLAN 5.7: the release zip. It must contain exactly extension/dist, be reproducible, open
// with a standard unzip, and, unpacked into a clean Chromium profile, flag the phishing
// fixture and not the benign one.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DIST,
  launchExtension,
  PAGES,
  servePages,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';
import { readZip } from '../scripts/zip.mjs';

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

const work = mkdtempSync(join(tmpdir(), 'phisheck-release-'));
/** Zips the current dist/ (built by the global setup) into `dir` and returns the zip. */
function pack(dir: string): Buffer {
  execFileSync(process.execPath, [`${SCRIPTS}package.mjs`, '--no-build', '--out', dir], {
    stdio: 'pipe',
  });
  return readFileSync(join(dir, `phisheck-${version}.zip`));
}

let zip: Buffer;
let unpacked: string;
let session: ExtensionSession;

beforeAll(async () => {
  zip = pack(join(work, 'a'));
  unpacked = join(work, 'unpacked');
  for (const { name, data } of readZip(zip)) {
    const target = join(unpacked, name);
    if (!target.startsWith(unpacked + sep)) throw new Error(`unsafe path in zip: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  session = await launchExtension(unpacked);
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
  rmSync(work, { recursive: true, force: true });
});

const filesIn = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort();

describe(`release package phisheck-${version}.zip`, { timeout: 60_000 }, () => {
  it('contains exactly extension/dist, byte for byte', () => {
    expect(filesIn(unpacked)).toEqual(filesIn(DIST));
    for (const name of filesIn(DIST)) {
      expect(readFileSync(join(unpacked, name)).equals(readFileSync(join(DIST, name))), name).toBe(
        true,
      );
    }
    expect(filesIn(unpacked)).not.toContainEqual(expect.stringMatching(/\.(map|ts)$/));
  });

  it('is reproducible', () => {
    expect(pack(join(work, 'b')).equals(zip)).toBe(true);
  });

  it('opens with a standard unzip (Python zipfile)', () => {
    const out = execFileSync(
      'python3',
      [
        '-I',
        '-c',
        'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); ' +
          'assert z.testzip() is None; print(len(z.namelist()))',
        join(work, 'a', `phisheck-${version}.zip`),
      ],
      { encoding: 'utf8' },
    );
    expect(Number(out.trim())).toBe(filesIn(DIST).length);
  });

  it('installs in a clean profile with the release version', async () => {
    const manifest = await session.serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.version).toBe(version);
    expect(manifest.icons?.['128']).toBe('icons/icon128.png');
  });

  it('smoke test: flags the phishing fixture (banner + badge)', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.phishing.url);
    await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
    const tabId = await tabIdOf(session, page);
    expect(
      await session.serviceWorker.evaluate(
        (id) => chrome.action.getBadgeText({ tabId: id }),
        tabId,
      ),
    ).toBe('!');
    await page.close();
  });

  it('smoke test: does not flag the benign fixture', async () => {
    const page = await session.context.newPage();
    await page.goto(PAGES.benign.url);
    expect(await settledTabState(session, page)).toMatchObject({ status: 'done', flagged: false });
    expect(await page.locator('phisheck-banner').count()).toBe(0);
    await page.close();
  });
});
