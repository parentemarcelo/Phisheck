// Runs once before the test suite: (re)build artefacts that tests load from disk, so tests
// never run against a stale browser bundle or extension build.
import { execFileSync } from 'node:child_process';

export default function setup(): void {
  execFileSync(process.execPath, ['shared/scripts/build-extractor.mjs'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['extension/scripts/build.mjs'], { stdio: 'inherit' });
}
