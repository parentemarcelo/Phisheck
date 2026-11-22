// PLAN 4.11: Settings page — every control persists across reloads and affects matching (FR11).
import type { Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  setSettings,
  settledTabState,
  type ExtensionSession,
} from './harness.js';
import type { Settings } from '../src/common/settings.js';

const SUB_URL = 'http://login.paypal-account-verify.xyz/signin/';
let session: ExtensionSession;
let settingsPage: Page;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [SUB_URL]: PAGES.phishing.html,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

beforeEach(async () => {
  await setSettings(session, {
    enabled: true,
    threshold: 0.8,
    trustedUrls: [],
    trustedDomains: [],
  });
  await settingsPage?.close();
  settingsPage = await session.context.newPage();
  await settingsPage.goto(`chrome-extension://${session.extensionId}/settings.html`);
});

const stored = () =>
  session.serviceWorker.evaluate(() => chrome.storage.local.get(null)) as Promise<
    Partial<Settings>
  >;

/** Visits `url` in a new tab and returns its settled tab state. */
async function visit(url: string) {
  const page = await session.context.newPage();
  await page.goto(url);
  const state = await settledTabState(session, page);
  await page.close();
  return state;
}

describe('settings page', { timeout: 30_000 }, () => {
  it('shows the defaults', async () => {
    const p = settingsPage;
    expect(await p.getByRole('switch', { name: /Check pages for phishing/ }).isChecked()).toBe(
      true,
    );
    expect(await p.locator('#threshold').inputValue()).toBe('80');
    expect(await p.locator('#threshold-value').textContent()).toBe('80%');
    expect(await p.getByText('No trusted pages.').isVisible()).toBe(true);
    expect(await p.getByText('No trusted domains.').isVisible()).toBe(true);
    expect(await p.getByLabel('Include subdomains').isChecked()).toBe(true);
  });

  it('saves the on/off switch and keeps it after reload', async () => {
    const p = settingsPage;
    await p.getByRole('switch').uncheck();
    await expect.poll(async () => (await stored()).enabled).toBe(false);
    await p.reload();
    expect(await p.getByRole('switch').isChecked()).toBe(false);
  });

  it('saves the threshold, keeps it after reload, and uses it for verdicts', async () => {
    const p = settingsPage;
    await p.locator('#threshold').fill('93');
    await expect.poll(async () => (await stored()).threshold).toBe(0.93);
    await p.reload();
    expect(await p.locator('#threshold').inputValue()).toBe('93');
    expect(await p.locator('#threshold-value').textContent()).toBe('93%');
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'done', threshold: 0.93 });
  });

  it('adds a domain with subdomains: the domain and its subdomains are trusted', async () => {
    const p = settingsPage;
    await p.getByLabel('Domain', { exact: true }).fill('Paypal-Account-Verify.xyz');
    await p.getByRole('button', { name: 'Add domain' }).click();
    await expect.poll(() => p.locator('#trusted-domains li').count()).toBe(1);
    expect(await p.locator('#trusted-domains li').textContent()).toContain(
      'paypal-account-verify.xyz',
    );
    expect((await stored()).trustedDomains).toEqual([
      { domain: 'paypal-account-verify.xyz', includeSubdomains: true },
    ]);
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'skipped', reason: 'trusted' });
    expect(await visit(SUB_URL)).toMatchObject({ status: 'skipped', reason: 'trusted' });

    await p.reload();
    expect(await p.locator('#trusted-domains li').count()).toBe(1);
  });

  it('adds a domain without subdomains: subdomains are still checked', async () => {
    const p = settingsPage;
    await p.getByLabel('Domain', { exact: true }).fill('paypal-account-verify.xyz');
    await p.getByLabel('Include subdomains').uncheck();
    await p.getByRole('button', { name: 'Add domain' }).click();
    await expect
      .poll(() => p.locator('#trusted-domains li').textContent())
      .toContain('this domain only');
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'skipped' });
    expect(await visit(SUB_URL)).toMatchObject({ status: 'done', flagged: true });
  });

  it('removes a domain', async () => {
    await setSettings(session, {
      trustedDomains: [{ domain: 'paypal-account-verify.xyz', includeSubdomains: true }],
    });
    const p = settingsPage;
    await p.getByRole('button', { name: 'Remove paypal-account-verify.xyz' }).click();
    await expect.poll(async () => (await stored()).trustedDomains).toEqual([]);
    await p.reload();
    expect(await p.getByText('No trusted domains.').isVisible()).toBe(true);
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'done', flagged: true });
  });

  it('rejects an invalid domain with a message', async () => {
    const p = settingsPage;
    await p.getByLabel('Domain', { exact: true }).fill('not a domain');
    await p.getByRole('button', { name: 'Add domain' }).click();
    await expect
      .poll(() => p.locator('#domain-error').textContent())
      .toMatch(/Enter a domain name/);
    expect((await stored()).trustedDomains).toEqual([]);
  });

  it('lists trusted URLs, updates live, and removes them', async () => {
    const p = settingsPage;
    await setSettings(session, { trustedUrls: [PAGES.phishing.url] });
    await expect.poll(() => p.locator('#trusted-urls li').count()).toBe(1); // live update
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'skipped', reason: 'trusted' });

    await p.getByRole('button', { name: `Remove ${PAGES.phishing.url}` }).click();
    await expect.poll(async () => (await stored()).trustedUrls).toEqual([]);
    await p.reload();
    expect(await p.getByText('No trusted pages.').isVisible()).toBe(true);
    expect(await visit(PAGES.phishing.url)).toMatchObject({ status: 'done', flagged: true });
  });
});
