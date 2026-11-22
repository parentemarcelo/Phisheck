/**
 * Messages between the content script and the service worker. Extension messaging is JSON,
 * which has no NaN, so missing feature values (NaN) travel as null and are restored on arrival.
 */
import type { FeatureVector } from '@phisheck/shared/features';

export interface WireVector {
  schemaVersion: number;
  values: (number | null)[];
}

/** Content script → service worker: the features of the page it analysed. */
export interface FeaturesMessage {
  type: 'phisheck:features';
  /** Token the service worker gave this analysis; stale results are discarded. */
  navigationId: string;
  url: string;
  vector: WireVector;
  /** DOM extraction threw, so DOM features are missing (URL-only result). */
  domError?: string;
}

/** Service worker → content script. */
export type VerdictResponse =
  | { status: 'done'; flagged: boolean; probability: number; threshold: number }
  | { status: 'stale' }
  | { status: 'skipped'; reason: 'disabled' | 'trusted' }
  | { status: 'error'; message: string };

export function toWire(vector: FeatureVector): WireVector {
  return {
    schemaVersion: vector.schemaVersion,
    values: vector.values.map((v) => (Number.isNaN(v) ? null : v)),
  };
}

/** Validates and decodes a vector received over messaging; throws on anything malformed. */
export function fromWire(wire: unknown, expectedLength: number): FeatureVector {
  if (typeof wire !== 'object' || wire === null) throw new TypeError('vector is not an object');
  const { schemaVersion, values } = wire as Record<string, unknown>;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw new TypeError('vector has no schema version');
  }
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new TypeError(`vector must have ${expectedLength} values`);
  }
  return {
    schemaVersion,
    values: values.map((v, i) => {
      if (v === null) return Number.NaN;
      if (typeof v !== 'number' || !Number.isFinite(v))
        throw new TypeError(`value ${i} is not a number`);
      return v;
    }),
  };
}

export function isFeaturesMessage(message: unknown): message is FeaturesMessage {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    m.type === 'phisheck:features' &&
    typeof m.navigationId === 'string' &&
    typeof m.url === 'string' &&
    typeof m.vector === 'object'
  );
}

/** Service worker → content script: remove the banner (the SPA moved to another page). */
export interface HideBannerMessage {
  type: 'phisheck:hide-banner';
}

/** Banner or popup → service worker: trust this exact URL (FR8). */
export interface TrustMessage {
  type: 'phisheck:trust';
  url: string;
  /** Set by the popup (an extension page has no tab); a content script's tab is its sender. */
  tabId?: number;
}

export function isTrustMessage(message: unknown): message is TrustMessage {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    m.type === 'phisheck:trust' &&
    typeof m.url === 'string' &&
    (m.tabId === undefined || Number.isInteger(m.tabId))
  );
}
