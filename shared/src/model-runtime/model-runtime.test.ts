import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ModelFormatError,
  parseModel,
  predictProbability,
  rawScore,
  type ModelJson,
  type TreeJson,
} from './index.js';

const sigmoid = (x: number, k = 1): number => 1 / (1 + Math.exp(-k * x));

/**
 * Three trees over three features:
 *   A: f0 <= 1 (NaN branch, default left) ? 0.5 : (f1 <= -2 (zero branch, default right) ? -1 : 2)
 *   B: f2 <= 0.5 (no missing branch: NaN reads as 0) ? 0.25 : -0.75
 *   C: single leaf 0.1
 */
function tinyModel(overrides: Partial<ModelJson> = {}): ModelJson {
  return {
    format: 'phisheck-lightgbm',
    format_version: 1,
    schema_version: 7,
    feature_names: ['f0', 'f1', 'f2'],
    objective: { type: 'binary', sigmoid: 1 },
    metadata: { note: 'hand-built' },
    trees: [
      {
        split_feature: [0, 1],
        threshold: [1, -2],
        missing_type: [2, 1],
        default_left: [1, 0],
        left: [-1, -2],
        right: [1, -3],
        leaf_value: [0.5, -1, 2],
      },
      {
        split_feature: [2],
        threshold: [0.5],
        missing_type: [0],
        default_left: [1],
        left: [-1],
        right: [-2],
        leaf_value: [0.25, -0.75],
      },
      {
        split_feature: [],
        threshold: [],
        missing_type: [],
        default_left: [],
        left: [],
        right: [],
        leaf_value: [0.1],
      },
    ],
    ...overrides,
  };
}

describe('predict', () => {
  const model = parseModel(tinyModel());

  it.each([
    ['plain values', [0.5, 7, 1], 0.5 - 0.75 + 0.1],
    ['threshold is inclusive (<=)', [1, 7, 0.5], 0.5 + 0.25 + 0.1],
    ['NaN takes the default branch on a NaN split', [NaN, 7, 9], 0.5 - 0.75 + 0.1],
    ['NaN reads as 0 on a split without a missing branch', [3, -5, NaN], -1 + 0.25 + 0.1],
    ['zero takes the default branch on a zero split', [3, 0, 9], 2 - 0.75 + 0.1],
    ['|x| <= 1e-35 counts as zero', [3, -1e-36, 9], 2 - 0.75 + 0.1],
    ['NaN reads as 0, so takes the default on a zero split', [3, NaN, 9], 2 - 0.75 + 0.1],
    ['ordinary comparison on a zero split', [3, -2, 9], -1 - 0.75 + 0.1],
    ['above threshold on a zero split', [3, 5, 9], 2 - 0.75 + 0.1],
  ])('%s', (_, features, raw) => {
    expect(rawScore(model, features)).toBeCloseTo(raw, 15);
    expect(predictProbability(model, features)).toBeCloseTo(sigmoid(raw), 15);
  });

  it('applies the objective sigmoid parameter', () => {
    const scaled = parseModel(tinyModel({ objective: { type: 'binary', sigmoid: 2 } }));
    expect(predictProbability(scaled, [0.5, 7, 1])).toBeCloseTo(sigmoid(-0.15, 2), 15);
  });

  it('accepts typed arrays and rejects the wrong width', () => {
    expect(rawScore(model, Float64Array.of(0.5, 7, 1))).toBeCloseTo(-0.15, 15);
    expect(() => rawScore(model, [1, 2])).toThrow(RangeError);
  });
});

describe('parseModel', () => {
  const broken = (mutate: (m: ModelJson, tree: (i: number) => TreeJson) => void): ModelJson => {
    const m = structuredClone(tinyModel());
    const tree = (i: number): TreeJson => {
      const t = m.trees[i];
      if (t === undefined) throw new Error(`no tree ${i}`);
      return t;
    };
    mutate(m, tree);
    return m;
  };

  it.each<[string, unknown, RegExp]>([
    ['non-object', 'model', /not an object/],
    ['wrong format', broken((m) => (m.format = 'xgboost')), /format/],
    ['unsupported format version', broken((m) => (m.format_version = 2)), /format_version/],
    ['missing schema version', broken((m) => (m.schema_version = 0)), /schema_version/],
    ['non-binary objective', broken((m) => (m.objective.type = 'regression')), /binary/],
    ['no trees', broken((m) => (m.trees = [])), /trees is empty/],
    ['feature out of range', broken((_, t) => (t(0).split_feature[0] = 3)), /feature 3/],
    ['self-loop', broken((_, t) => (t(0).right[0] = 0)), /child 0/],
    ['backward edge', broken((_, t) => (t(0).left[1] = 0)), /child 0/],
    ['leaf out of range', broken((_, t) => (t(1).right[0] = -3)), /child -3/],
    ['leaf count', broken((_, t) => t(2).leaf_value.push(1)), /2 leaves for 0 splits/],
    ['array length', broken((_, t) => t(0).threshold.pop()), /threshold has 1 entries/],
    ['non-finite number', broken((_, t) => (t(0).threshold[0] = Infinity)), /threshold contains/],
    ['bad missing type', broken((_, t) => (t(0).missing_type[0] = 3)), /missing_type 3/],
    ['bad default_left', broken((_, t) => (t(0).default_left[0] = 2)), /default_left/],
  ])('rejects %s', (_, json, message) => {
    expect(() => parseModel(json)).toThrow(ModelFormatError);
    expect(() => parseModel(json)).toThrow(message);
  });

  it('keeps metadata and feature names', () => {
    const model = parseModel(tinyModel());
    expect(model.schemaVersion).toBe(7);
    expect(model.featureNames).toEqual(['f0', 'f1', 'f2']);
    expect(model.metadata).toEqual({ note: 'hand-built' });
    expect(model.trees).toHaveLength(3);
  });
});

describe('committed models/model.json', () => {
  it('parses and yields probabilities', () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL('../../../models/model.json', import.meta.url), 'utf8'),
    );
    const model = parseModel(json);
    expect(model.trees.length).toBeGreaterThan(0);
    const allMissing = new Array<number>(model.featureNames.length).fill(NaN);
    const p = predictProbability(model, allMissing);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});
