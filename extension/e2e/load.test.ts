// PLAN 4.1: the unpacked build loads in Chromium and its service worker registers.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchExtension, type ExtensionSession } from './harness.js';

let session: ExtensionSession;

beforeAll(async () => {
  session = await launchExtension();
}, 60_000);

afterAll(async () => {
  await session?.close();
});

describe('unpacked extension', () => {
  it('registers its service worker', () => {
    expect(session.extensionId).toMatch(/^[a-p]{32}$/);
    expect(session.serviceWorker.url()).toBe(
      `chrome-extension://${session.extensionId}/background.js`,
    );
  });

  it('has the manifest of the spec (permissions, incognito spanning, settings page)', async () => {
    const manifest = await session.serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions?.sort()).toEqual(['scripting', 'storage', 'webNavigation']);
    expect(manifest.host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.incognito).toBe('spanning');
    expect(manifest.options_page).toBe('settings.html');
    expect(manifest.action?.default_popup).toBeUndefined(); // popup is set per flagged tab (FR10)
  });

  it('serves the popup and settings pages', async () => {
    for (const page of ['popup.html', 'settings.html']) {
      const tab = await session.context.newPage();
      const response = await tab.goto(`chrome-extension://${session.extensionId}/${page}`);
      expect(response?.ok()).toBe(true);
      await tab.close();
    }
  });
});
