import platforms from './hosting-platforms.json' with { type: 'json' };

/**
 * Curated word lists used by the features. Changing a list changes feature semantics:
 * bump SCHEMA_VERSION (schema.ts) and retrain. Keep entries lower-case.
 */

/**
 * TLDs over-represented in phishing/abuse reports (Spamhaus, Interisle, APWG). A signal for
 * the model to weigh — not a verdict on its own.
 */
export const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set([
  'best',
  'bond',
  'buzz',
  'cam',
  'cf',
  'cfd',
  'click',
  'country',
  'cyou',
  'date',
  'download',
  'fit',
  'ga',
  'gq',
  'icu',
  'kim',
  'link',
  'loan',
  'lol',
  'men',
  'ml',
  'mom',
  'monster',
  'mov',
  'online',
  'quest',
  'racing',
  'rest',
  'review',
  'sbs',
  'shop',
  'site',
  'stream',
  'support',
  'tk',
  'top',
  'uno',
  'win',
  'work',
  'xyz',
  'zip',
]);

/** Registrable domains of public URL-shortening services. */
export const URL_SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly',
  'bitly.com',
  'bl.ink',
  'buff.ly',
  'cutt.ly',
  'goo.gl',
  'is.gd',
  'lnkd.in',
  'ow.ly',
  'qrco.de',
  'rb.gy',
  'rebrand.ly',
  's.id',
  'shorturl.at',
  't.co',
  't.ly',
  'tiny.cc',
  'tinyurl.com',
  'v.gd',
]);

const PLATFORM_TENANT_PARENTS: readonly string[] = platforms.hosts
  .filter((h) => h.startsWith('*.'))
  .map((h) => h.slice(2));
const PLATFORM_EXACT_HOSTS: ReadonlySet<string> = new Set(
  platforms.hosts.filter((h) => !h.startsWith('*.')),
);

/**
 * True when the hostname is a tenant of a multi-tenant hosting/forms platform
 * (hosting-platforms.json): a subdomain of a `*.parent` entry (other than `www.parent`), or an
 * exact path-tenanted host such as sites.google.com.
 */
export function isHostingPlatform(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (PLATFORM_EXACT_HOSTS.has(host)) return true;
  return PLATFORM_TENANT_PARENTS.some(
    (parent) => host.endsWith(`.${parent}`) && host !== `www.${parent}`,
  );
}
