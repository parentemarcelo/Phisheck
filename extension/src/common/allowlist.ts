/**
 * Allowlist matching (PLAN 4.3, FR6, D7, D29). A trusted page is not analysed at all.
 *
 * - Trusted URL: the exact URL, ignoring only what doesn't change which page it is: the
 *   `#fragment` (FR2 treats fragment changes as the same page), default ports, host case and
 *   a single trailing slash. The query and the scheme matter: trusting `https://x/` does not
 *   trust `http://x/`.
 * - Trusted domain: the hostname equals the domain, or (with includeSubdomains) ends with
 *   `.domain`. Hostnames are compared in their ASCII (punycode) form, as `URL` gives them.
 */
import type { Settings, TrustedDomain } from './settings.js';

/** Canonical form of a trusted URL, or null if it isn't an http(s) URL. */
export function normaliseUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.href;
}

/**
 * Canonical form of a domain typed by the user: accepts `Example.com`, `*.example.com`,
 * `https://example.com/path`, `bücher.de`; returns `example.com`, `xn--bcher-kva.de`, …,
 * or null if it isn't a valid hostname.
 */
export function normaliseDomain(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (text.startsWith('*.')) text = text.slice(2);
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `http://${text}`;
  let host: string;
  try {
    const url = new URL(text);
    if (url.username || url.password) return null;
    host = url.hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '');
  // Don't rely on URL alone: Chromium's parser accepts e.g. spaces in hosts ("a%20b").
  if (!HOSTNAME.test(host) && !IPV6.test(host)) return null;
  return host;
}

/** DNS-style ASCII hostname: dot-separated labels of 1–63 letters, digits, '-' or '_'. */
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/;

export function domainMatches(hostname: string, entry: TrustedDomain): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === entry.domain || (entry.includeSubdomains && host.endsWith(`.${entry.domain}`));
}

export type TrustReason = 'url' | 'domain';

/** Why `url` is trusted, or null if it isn't. */
export function trustReason(
  url: string,
  settings: Pick<Settings, 'trustedUrls' | 'trustedDomains'>,
): TrustReason | null {
  const normalised = normaliseUrl(url);
  if (normalised === null) return null;
  if (settings.trustedUrls.some((u) => normaliseUrl(u) === normalised)) return 'url';
  const { hostname } = new URL(normalised);
  if (settings.trustedDomains.some((d) => domainMatches(hostname, d))) return 'domain';
  return null;
}

export function isTrusted(
  url: string,
  settings: Pick<Settings, 'trustedUrls' | 'trustedDomains'>,
): boolean {
  return trustReason(url, settings) !== null;
}
