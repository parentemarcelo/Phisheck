import { describe, expect, it } from 'vitest';
import {
  assembleVector,
  DOM_FEATURE_NAMES,
  FEATURE_NAMES,
  FEATURES,
  missingDomFeatures,
  SCHEMA_VERSION,
  URL_FEATURE_NAMES,
  vectorToRecord,
  type DomFeatures,
  type UrlFeatures,
} from './schema.js';

const urlZeros = (): UrlFeatures =>
  Object.fromEntries(URL_FEATURE_NAMES.map((n) => [n, 0])) as UrlFeatures;
const domZeros = (): DomFeatures =>
  Object.fromEntries(DOM_FEATURE_NAMES.map((n) => [n, 0])) as DomFeatures;

describe('feature schema', () => {
  it('has a stable order (update the snapshot only together with SCHEMA_VERSION)', () => {
    expect({ SCHEMA_VERSION, FEATURE_NAMES }).toMatchSnapshot();
  });

  it('has unique, snake_case names with descriptions', () => {
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_NAMES.length);
    for (const f of FEATURES) {
      expect(f.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it('lists all URL features before all DOM features', () => {
    expect([...URL_FEATURE_NAMES, ...DOM_FEATURE_NAMES]).toEqual(FEATURE_NAMES);
    expect(URL_FEATURE_NAMES.length).toBeGreaterThan(0);
    expect(DOM_FEATURE_NAMES.length).toBeGreaterThan(0);
  });
});

describe('assembleVector', () => {
  it('produces a vector whose length equals the schema length', () => {
    const v = assembleVector(urlZeros(), domZeros());
    expect(v.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v.values).toHaveLength(FEATURE_NAMES.length);
  });

  it('places each value at its schema index', () => {
    const url = urlZeros();
    url.num_dots = 7;
    const dom = domZeros();
    dom.right_click_disabled = 1;
    const v = assembleVector(url, dom);
    expect(v.values[FEATURE_NAMES.indexOf('num_dots')]).toBe(7);
    expect(v.values[FEATURE_NAMES.indexOf('right_click_disabled')]).toBe(1);
    expect(vectorToRecord(v).num_dots).toBe(7);
  });

  it('keeps NaN for missing DOM features', () => {
    const v = assembleVector(urlZeros(), missingDomFeatures());
    const rec = vectorToRecord(v);
    for (const n of DOM_FEATURE_NAMES) expect(rec[n]).toBeNaN();
    for (const n of URL_FEATURE_NAMES) expect(rec[n]).toBe(0);
  });

  it('throws when a feature was not computed', () => {
    const url = urlZeros() as Partial<UrlFeatures>;
    delete url.num_dots;
    expect(() => assembleVector(url as UrlFeatures, domZeros())).toThrow(/num_dots/);
  });
});

describe('vectorToRecord', () => {
  it('rejects a vector from another schema version', () => {
    const v = { schemaVersion: SCHEMA_VERSION + 1, values: [] };
    expect(() => vectorToRecord(v)).toThrow(/version mismatch/i);
  });

  it('rejects a vector of the wrong length', () => {
    const v = { schemaVersion: SCHEMA_VERSION, values: [1, 2, 3] };
    expect(() => vectorToRecord(v)).toThrow(/length/);
  });
});
