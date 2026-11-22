// PLAN 5.3: accessibility of the banner, popup and settings — axe-core (WCAG 2.2 A/AA and best
// practices) in light and dark mode, plus keyboard-only use of every control.
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  launchExtension,
  PAGES,
  servePages,
  setSettings,
  settledTabState,
  tabIdOf,
  type ExtensionSession,
} from './harness.js';

const axeSource = (createRequire(import.meta.url)('axe-core') as { source: string }).source;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

/**
 * Runs axe-core in `page` (injected through the DevTools protocol, so neither the page nor the
 * extension pages need to allow it) and returns its violations, readable in a failed assertion.
 */
async function axe(page: Page, include?: string[][]): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(axeSource);
  const violations = await page.evaluate(
    async ({ tags, include }) => {
      const run = (window as unknown as { axe: { run: (...a: unknown[]) => Promise<unknown> } }).axe
        .run;
      const result = (await run(include ? { include } : document, {
        runOnly: { type: 'tag', values: tags },
      })) as { violations: AxeViolation[]; passes: unknown[] };
      // A selector that matched nothing would pass vacuously.
      if (result.passes.length === 0) throw new Error('axe checked nothing');
      return result.violations;
    },
    { tags: TAGS, include },
  );
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .map((n) => `${JSON.stringify(n.target)} ${n.failureSummary ?? ''}`)
        .join('; ')}`,
  );
}

let session: ExtensionSession;

beforeAll(async () => {
  session = await launchExtension();
  await servePages(session.context, {
    [PAGES.phishing.url]: PAGES.phishing.html,
    [PAGES.benign.url]: PAGES.benign.html,
  });
}, 60_000);

afterAll(async () => {
  await session?.close();
});

const extensionPage = (path: string) => `chrome-extension://${session.extensionId}/${path}`;

async function flaggedTab(): Promise<{ page: Page; tabId: number }> {
  const page = await session.context.newPage();
  await page.goto(PAGES.phishing.url);
  await expect.poll(() => page.locator('phisheck-banner').count(), { timeout: 15_000 }).toBe(1);
  return { page, tabId: await tabIdOf(session, page) };
}

describe('accessibility', { timeout: 60_000 }, () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    describe(`axe-core, ${colorScheme} mode`, () => {
      it('banner has no violations', async () => {
        const { page } = await flaggedTab();
        await page.emulateMedia({ colorScheme });
        expect(await axe(page, [['phisheck-banner']])).toEqual([]);
        await page.close();
      });

      it('popup on a flagged tab has no violations', async () => {
        const { page, tabId } = await flaggedTab();
        const popup = await session.context.newPage();
        await popup.emulateMedia({ colorScheme });
        await popup.goto(extensionPage(`popup.html?tabId=${tabId}`));
        await expect.poll(() => popup.locator('#verdict').textContent()).toBe('Likely phishing');
        expect(await axe(popup)).toEqual([]);
        await popup.close();
        await page.close();
      });

      it('popup without a warning has no violations', async () => {
        const page = await session.context.newPage();
        await page.goto(PAGES.benign.url);
        await settledTabState(session, page);
        const popup = await session.context.newPage();
        await popup.emulateMedia({ colorScheme });
        await popup.goto(extensionPage(`popup.html?tabId=${await tabIdOf(session, page)}`));
        await expect
          .poll(() => popup.locator('#verdict').textContent())
          .toBe('No warning for this page');
        expect(await axe(popup)).toEqual([]);
        await popup.close();
        await page.close();
      });

      it('settings page (with lists and an error shown) has no violations', async () => {
        await setSettings(session, {
          enabled: true,
          threshold: 0.8,
          trustedUrls: ['https://example.com/login'],
          trustedDomains: [{ domain: 'example.org', includeSubdomains: true }],
        });
        const settings = await session.context.newPage();
        await settings.emulateMedia({ colorScheme });
        await settings.goto(extensionPage('settings.html'));
        await expect.poll(() => settings.locator('#trusted-urls li').count()).toBe(1);
        expect(await axe(settings)).toEqual([]);
        await settings.locator('#domain-input').fill('not a domain');
        await settings.getByRole('button', { name: 'Add domain' }).click();
        await expect.poll(() => settings.locator('#domain-error').textContent()).not.toBe('');
        expect(await axe(settings)).toEqual([]);
        await settings.close();
        await setSettings(session, { trustedUrls: [], trustedDomains: [] });
      });
    });
  }

  describe('keyboard only', () => {
    it('banner: Tab reaches both buttons and Enter dismisses', async () => {
      const { page } = await flaggedTab();
      const focused = async () =>
        page.evaluate(
          () =>
            document.activeElement?.shadowRoot?.activeElement?.textContent ??
            document.activeElement?.tagName,
        );
      const seen: (string | undefined)[] = [];
      for (let i = 0; i < 20 && !seen.includes('Trust this URL'); i++) {
        await page.keyboard.press('Tab');
        seen.push(await focused());
      }
      expect(seen).toContain('Dismiss');
      expect(seen).toContain('Trust this URL');
      await page.keyboard.press('Shift+Tab');
      expect(await focused()).toBe('Dismiss');
      await page.keyboard.press('Enter');
      await expect.poll(() => page.locator('phisheck-banner').count()).toBe(0);
      await page.close();
    });

    it('popup: Tab to Trust this URL and Enter trusts the page', async () => {
      const { page, tabId } = await flaggedTab();
      const popup = await session.context.newPage();
      await popup.goto(extensionPage(`popup.html?tabId=${tabId}`));
      await expect.poll(() => popup.locator('#verdict').textContent()).toBe('Likely phishing');
      await popup.keyboard.press('Tab');
      expect(await popup.evaluate(() => document.activeElement?.textContent)).toBe(
        'Trust this URL',
      );
      await popup.keyboard.press('Enter');
      await expect.poll(() => popup.locator('#status').textContent()).toMatch(/^Trusted/);
      await expect.poll(() => page.locator('phisheck-banner').count()).toBe(0);
      await popup.close();
      await page.close();
      await setSettings(session, { trustedUrls: [] });
    });

    it('settings: switch, threshold, domain form and Remove work from the keyboard', async () => {
      await setSettings(session, {
        enabled: true,
        threshold: 0.8,
        trustedUrls: ['https://example.com/login'],
        trustedDomains: [],
      });
      const settings = await session.context.newPage();
      await settings.goto(extensionPage('settings.html'));
      await expect.poll(() => settings.locator('#trusted-urls li').count()).toBe(1);
      const stored = () =>
        session.serviceWorker.evaluate(() => chrome.storage.local.get(null)) as Promise<{
          enabled: boolean;
          threshold: number;
          trustedUrls: string[];
          trustedDomains: { domain: string; includeSubdomains: boolean }[];
        }>;
      const focusedId = () => settings.evaluate(() => document.activeElement?.id);

      await settings.keyboard.press('Tab');
      expect(await focusedId()).toBe('enabled');
      await settings.keyboard.press('Space');
      await expect.poll(async () => (await stored()).enabled).toBe(false);
      await settings.keyboard.press('Space');
      await expect.poll(async () => (await stored()).enabled).toBe(true);

      await settings.keyboard.press('Tab');
      expect(await focusedId()).toBe('threshold');
      await settings.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await stored()).threshold).toBe(0.79);
      await settings.keyboard.press('ArrowRight');
      await expect.poll(async () => (await stored()).threshold).toBe(0.8);

      await settings.keyboard.press('Tab');
      expect(await settings.evaluate(() => document.activeElement?.textContent)).toBe('Remove');
      await settings.keyboard.press('Enter');
      await expect.poll(async () => (await stored()).trustedUrls).toEqual([]);

      await settings.locator('#domain-input').focus();
      await settings.keyboard.type('example.net');
      await settings.keyboard.press('Enter');
      await expect
        .poll(async () => (await stored()).trustedDomains)
        .toEqual([{ domain: 'example.net', includeSubdomains: true }]);
      await settings.close();
      await setSettings(session, { trustedDomains: [] });
    });
  });
});
