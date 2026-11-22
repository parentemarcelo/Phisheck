import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES, SCHEMA_VERSION } from '../features/schema.js';
import {
  loadModel,
  ModelFormatError,
  ModelSchemaMismatchError,
  predictVector,
  type ModelJson,
} from './index.js';

/** A one-split model over the extractor's real feature names. */
function modelFor(schemaVersion: number, featureNames: readonly string[]): ModelJson {
  return {
    format: 'phisheck-lightgbm',
    format_version: 1,
    schema_version: schemaVersion,
    feature_names: [...featureNames],
    objective: { type: 'binary', sigmoid: 1 },
    metadata: {},
    trees: [
      {
        split_feature: [0],
        threshold: [10],
        missing_type: [0],
        default_left: [1],
        left: [-1],
        right: [-2],
        leaf_value: [-2, 2],
      },
    ],
  };
}

describe('loadModel', () => {
  it('accepts a model trained on the current schema', () => {
    const model = loadModel(modelFor(SCHEMA_VERSION, FEATURE_NAMES));
    expect(model.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('refuses a model from another schema version with a clear message', () => {
    const old = modelFor(SCHEMA_VERSION - 1, FEATURE_NAMES);
    expect(() => loadModel(old)).toThrow(ModelSchemaMismatchError);
    expect(() => loadModel(old)).toThrow(
      `model was trained on feature schema v${SCHEMA_VERSION - 1}, but the extractor produces v${SCHEMA_VERSION}`,
    );
  });

  it('refuses reordered, renamed, missing or extra features even at the same version', () => {
    const swapped: string[] = [...FEATURE_NAMES];
    [swapped[0], swapped[1]] = [swapped[1] ?? '', swapped[0] ?? ''];
    expect(() => loadModel(modelFor(SCHEMA_VERSION, swapped))).toThrow(/model feature 0 is/);
    expect(() =>
      loadModel(modelFor(SCHEMA_VERSION, [...FEATURE_NAMES.slice(0, -1), 'renamed'])),
    ).toThrow(/"renamed"/);
    expect(() => loadModel(modelFor(SCHEMA_VERSION, FEATURE_NAMES.slice(0, -1)))).toThrow(
      /is null/,
    );
    expect(() => loadModel(modelFor(SCHEMA_VERSION, [...FEATURE_NAMES, 'extra']))).toThrow(
      ModelSchemaMismatchError,
    );
  });

  it('still reports malformed models as format errors', () => {
    expect(() => loadModel({ format: 'other' })).toThrow(ModelFormatError);
  });

  it('accepts the committed models/model.json', () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL('../../../models/model.json', import.meta.url), 'utf8'),
    );
    expect(loadModel(json).featureNames).toEqual(FEATURE_NAMES);
  });
});

describe('predictVector', () => {
  const model = loadModel(modelFor(SCHEMA_VERSION, FEATURE_NAMES));
  const values = new Array<number>(FEATURE_NAMES.length).fill(0);

  it('scores a vector from the current schema', () => {
    expect(predictVector(model, { schemaVersion: SCHEMA_VERSION, values })).toBeCloseTo(
      1 / (1 + Math.exp(2)),
      15,
    );
  });

  it('refuses a vector from another schema', () => {
    expect(() => predictVector(model, { schemaVersion: SCHEMA_VERSION + 1, values })).toThrow(
      ModelSchemaMismatchError,
    );
  });
});
