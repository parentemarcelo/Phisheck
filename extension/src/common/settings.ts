/**
 * Typed settings over `chrome.storage.local` (PLAN 4.2, FR6, FR11, FR12). Nothing is synced
 * (NFR privacy). Each setting is its own key, so a change event names exactly what changed.
 * Values read from storage are validated: anything malformed falls back to the default
 * instead of breaking detection.
 */
import { normaliseDomain, normaliseUrl } from './allowlist.js';

export interface TrustedDomain {
  /** Lower-case ASCII (punycode) hostname, e.g. `example.com`. */
  domain: string;
  /** Also trust every subdomain (D29: on by default). */
  includeSubdomains: boolean;
}

export interface Settings {
  /** D31: user switch, default on; the extension never turns itself off. */
  enabled: boolean;
  /** P(phishing) at or above which a page is flagged (D6: default 0.8). */
  threshold: number;
  /** Exact URLs trusted from the banner or popup (FR8). */
  trustedUrls: string[];
  trustedDomains: TrustedDomain[];
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  threshold: 0.8,
  trustedUrls: [],
  trustedDomains: [],
});

/** Slider range of the Settings page; stored values outside it are clamped. */
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.99;

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/** The part of `chrome.storage.StorageArea` this module uses (mockable in unit tests). */
export interface StorageAreaLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  onChanged: {
    addListener(callback: (changes: Record<string, StorageChange>) => void): void;
    removeListener(callback: (changes: Record<string, StorageChange>) => void): void;
  };
}

function defaultArea(): StorageAreaLike {
  return chrome.storage.local;
}

function isTrustedDomain(value: unknown): value is TrustedDomain {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.domain === 'string' && v.domain !== '' && typeof v.includeSubdomains === 'boolean'
  );
}

export function clampThreshold(value: number): number {
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));
}

/** Validates raw stored values; a missing or malformed value becomes its default. */
export function sanitise(raw: Record<string, unknown>): Settings {
  const { enabled, threshold, trustedUrls, trustedDomains } = raw;
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SETTINGS.enabled,
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? clampThreshold(threshold)
        : DEFAULT_SETTINGS.threshold,
    trustedUrls: Array.isArray(trustedUrls)
      ? [...new Set(trustedUrls.filter((u): u is string => typeof u === 'string' && u !== ''))]
      : [],
    trustedDomains: Array.isArray(trustedDomains) ? trustedDomains.filter(isTrustedDomain) : [],
  };
}

export async function getSettings(area: StorageAreaLike = defaultArea()): Promise<Settings> {
  return sanitise(await area.get(KEYS));
}

// Read-modify-write updates are queued so concurrent edits (e.g. Trust clicked in the banner
// and the popup at once) cannot overwrite each other within this extension context.
let queue: Promise<unknown> = Promise.resolve();

/** Applies `change` to the current settings and stores the result. */
export function updateSettings(
  change: (current: Settings) => Partial<Settings>,
  area: StorageAreaLike = defaultArea(),
): Promise<Settings> {
  const run = queue.then(async () => {
    const current = await getSettings(area);
    const patch = change(current);
    const next = sanitise({ ...current, ...patch });
    // Write only the keys the change touched, so listeners see exactly what changed.
    await area.set(Object.fromEntries(KEYS.filter((k) => k in patch).map((k) => [k, next[k]])));
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const setEnabled = (enabled: boolean, area?: StorageAreaLike) =>
  updateSettings(() => ({ enabled }), area);

export const setThreshold = (threshold: number, area?: StorageAreaLike) =>
  updateSettings(() => ({ threshold }), area);

/** Thrown when a URL or domain to trust is not valid. */
export class InvalidEntryError extends Error {
  override name = 'InvalidEntryError';
}

/**
 * Trusts the exact URL. It is stored as the user saw it (minus the #fragment) so the Settings
 * list is recognisable; matching and de-duplication use the canonical form (allowlist.ts).
 */
export function addTrustedUrl(url: string, area?: StorageAreaLike): Promise<Settings> {
  const canonical = normaliseUrl(url);
  if (canonical === null)
    return Promise.reject(new InvalidEntryError(`not an http(s) URL: ${url}`));
  const shown = new URL(url.trim());
  shown.hash = '';
  return updateSettings(
    (s) => ({
      trustedUrls: [...s.trustedUrls.filter((u) => normaliseUrl(u) !== canonical), shown.href],
    }),
    area,
  );
}

export function removeTrustedUrl(url: string, area?: StorageAreaLike): Promise<Settings> {
  return updateSettings((s) => ({ trustedUrls: s.trustedUrls.filter((u) => u !== url) }), area);
}

/** Adds or replaces the entry for the domain, normalised from user input (see allowlist.ts). */
export function addTrustedDomain(
  input: string,
  includeSubdomains: boolean,
  area?: StorageAreaLike,
): Promise<Settings> {
  const domain = normaliseDomain(input);
  if (domain === null) return Promise.reject(new InvalidEntryError(`not a valid domain: ${input}`));
  return updateSettings(
    (s) => ({
      trustedDomains: [
        ...s.trustedDomains.filter((d) => d.domain !== domain),
        { domain, includeSubdomains },
      ],
    }),
    area,
  );
}

export function removeTrustedDomain(domain: string, area?: StorageAreaLike): Promise<Settings> {
  return updateSettings(
    (s) => ({ trustedDomains: s.trustedDomains.filter((d) => d.domain !== domain) }),
    area,
  );
}

/**
 * Calls `callback` with the full, validated settings whenever any of them changes.
 * Returns a function that stops listening.
 */
export function onSettingsChanged(
  callback: (settings: Settings, changed: (keyof Settings)[]) => void,
  area: StorageAreaLike = defaultArea(),
): () => void {
  const listener = (changes: Record<string, StorageChange>) => {
    const changed = KEYS.filter((k) => k in changes);
    if (changed.length === 0) return;
    void getSettings(area).then((settings) => callback(settings, changed));
  };
  area.onChanged.addListener(listener);
  return () => area.onChanged.removeListener(listener);
}
