import { parse as parseDomain } from 'tldts';

/** Thrown for input that is not an absolute http(s) URL. */
export class InvalidUrlError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid URL "${input}": ${reason}`);
    this.name = 'InvalidUrlError';
  }
}

/**
 * A URL split into the parts the features need. All string parts are taken from the
 * WHATWG-normalised URL (lower-case host, IDN → punycode, percent-encoding), which is what
 * both Chrome (tab URLs) and Node produce, so extension and crawler see identical input.
 * The fragment ("#…") is dropped: it changes without a navigation and is client-side only.
 */
export interface UrlParts {
  readonly url: URL;
  /** Normalised full URL **without the fragment** (it never reaches the server). */
  readonly href: string;
  /** Hostname without a trailing dot; IPv6 keeps its brackets. */
  readonly hostname: string;
  readonly isIp: boolean;
  /** Registrable domain ("example.co.uk"); null for IPs and hosts without one. */
  readonly domain: string | null;
  /** Registrable label ("example"); null when there is no registrable domain. */
  readonly domainWithoutSuffix: string | null;
  /** Public suffix ("co.uk", or a private one such as "github.io"); null for IPs. */
  readonly publicSuffix: string | null;
  /** Labels left of the registrable domain, e.g. ["a", "b"] for a.b.example.com. */
  readonly subdomainLabels: readonly string[];
  /** True when the registrable domain sits on a private PSL suffix (github.io, …). */
  readonly isPrivateSuffix: boolean;
  /**
   * Identity used to compare "same site": the registrable domain, or the hostname when
   * there is none (IP addresses, localhost).
   */
  readonly site: string;
}

const PSL_OPTIONS = { allowPrivateDomains: true } as const;

/** Parses and normalises an absolute http(s) URL. Throws InvalidUrlError otherwise. */
export function parseUrl(input: string | URL): UrlParts {
  const raw = typeof input === 'string' ? input : input.href;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError(raw, 'not an absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError(raw, `unsupported scheme ${url.protocol}`);
  }
  url.hash = '';
  const hostname = url.hostname.replace(/\.$/, '');
  if (hostname === '') {
    throw new InvalidUrlError(raw, 'empty hostname');
  }

  const info = parseDomain(hostname, PSL_OPTIONS);
  const isIp = info.isIp === true;
  const domain = isIp ? null : info.domain;
  const subdomain = domain ? (info.subdomain ?? '') : '';

  return {
    url,
    href: url.href,
    hostname,
    isIp,
    domain,
    domainWithoutSuffix: domain ? info.domainWithoutSuffix : null,
    publicSuffix: isIp ? null : info.publicSuffix,
    subdomainLabels: subdomain === '' ? [] : subdomain.split('.'),
    isPrivateSuffix: domain !== null && info.isPrivate === true,
    site: domain ?? hostname,
  };
}

/**
 * Number of subdomain labels, ignoring a single leading "www" (which carries no signal).
 * Hosts without a registrable domain (IPs, localhost) have depth 0.
 */
export function subdomainDepth(parts: UrlParts): number {
  const labels = parts.subdomainLabels;
  return labels[0] === 'www' ? labels.length - 1 : labels.length;
}

/**
 * The "site" of another URL resolved against a base, or null when it is not http(s) or
 * cannot be parsed. A per-extraction cache keeps repeated hosts cheap on large pages.
 */
export function createSiteResolver(base: URL): (href: string) => ResolvedHref | null {
  const siteByHost = new Map<string, string>();
  return (href: string) => {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { url, site: null };
    }
    const host = url.hostname.replace(/\.$/, '');
    let site = siteByHost.get(host);
    if (site === undefined) {
      const info = parseDomain(host, PSL_OPTIONS);
      site = (info.isIp === true ? null : info.domain) ?? host;
      siteByHost.set(host, site);
    }
    return { url, site };
  };
}

export interface ResolvedHref {
  readonly url: URL;
  /** Site of an http(s) URL; null for other schemes (mailto:, data:, javascript:, …). */
  readonly site: string | null;
}
