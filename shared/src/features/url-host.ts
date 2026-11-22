import { isHostingPlatform, SUSPICIOUS_TLDS, URL_SHORTENERS } from './lists.js';
import type { UrlFeatures } from './schema.js';
import { subdomainDepth, type UrlParts } from './url-parts.js';

export const HOST_FEATURES = [
  'subdomain_depth',
  'is_ip_host',
  'is_punycode',
  'has_nonstandard_port',
  'on_private_suffix',
  'host_entropy',
  'max_host_label_length',
  'suspicious_tld',
  'is_shortener',
  'on_hosting_platform',
] as const satisfies readonly (keyof UrlFeatures)[];

export type HostFeatures = Pick<UrlFeatures, (typeof HOST_FEATURES)[number]>;

/** Shannon entropy in bits per character; 0 for the empty string. */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1);
  let entropy = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Properties of the hostname: structure, encoding, reputation lists. */
export function hostFeatures(parts: UrlParts): HostFeatures {
  const labels = parts.hostname.split('.');
  const tld = parts.isIp ? '' : (labels[labels.length - 1] ?? '');

  return {
    subdomain_depth: subdomainDepth(parts),
    is_ip_host: parts.isIp ? 1 : 0,
    is_punycode: labels.some((l) => l.startsWith('xn--')) ? 1 : 0,
    has_nonstandard_port: parts.url.port !== '' ? 1 : 0,
    on_private_suffix: parts.isPrivateSuffix ? 1 : 0,
    host_entropy: shannonEntropy(parts.domainWithoutSuffix ?? parts.hostname),
    max_host_label_length: Math.max(...labels.map((l) => l.length)),
    suspicious_tld: SUSPICIOUS_TLDS.has(tld) ? 1 : 0,
    is_shortener: URL_SHORTENERS.has(parts.site) ? 1 : 0,
    on_hosting_platform: isHostingPlatform(parts.hostname) ? 1 : 0,
  };
}
