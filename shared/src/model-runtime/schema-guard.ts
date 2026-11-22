import { FEATURE_NAMES, SCHEMA_VERSION, type FeatureVector } from '../features/schema.js';
import { parseModel, type Model } from './model.js';
import { predictProbability } from './predict.js';

/** The model was trained on features other than the ones this extractor produces. */
export class ModelSchemaMismatchError extends Error {
  override name = 'ModelSchemaMismatchError';
}

export interface ExpectedSchema {
  readonly schemaVersion: number;
  readonly featureNames: readonly string[];
}

const EXTRACTOR_SCHEMA: ExpectedSchema = {
  schemaVersion: SCHEMA_VERSION,
  featureNames: FEATURE_NAMES,
};

/**
 * Parses `model.json` and refuses it unless it was trained on exactly this extractor's
 * features: same SCHEMA_VERSION and the same feature names in the same order. A mismatch
 * means the model must be retrained and re-exported for this schema.
 */
export function loadModel(json: unknown, expected: ExpectedSchema = EXTRACTOR_SCHEMA): Model {
  const model = parseModel(json);
  if (model.schemaVersion !== expected.schemaVersion) {
    throw new ModelSchemaMismatchError(
      `model was trained on feature schema v${model.schemaVersion}, but the extractor produces ` +
        `v${expected.schemaVersion}; retrain and re-export the model`,
    );
  }
  const names = model.featureNames;
  const width = Math.max(names.length, expected.featureNames.length);
  for (let i = 0; i < width; i++) {
    if (names[i] !== expected.featureNames[i]) {
      throw new ModelSchemaMismatchError(
        `model feature ${i} is ${JSON.stringify(names[i] ?? null)}, but the extractor's is ` +
          `${JSON.stringify(expected.featureNames[i] ?? null)} (schema v${expected.schemaVersion})`,
      );
    }
  }
  return model;
}

/** Phishing probability for an extracted vector; refuses a vector from another schema. */
export function predictVector(model: Model, vector: FeatureVector): number {
  if (vector.schemaVersion !== model.schemaVersion) {
    throw new ModelSchemaMismatchError(
      `feature vector has schema v${vector.schemaVersion}, model expects v${model.schemaVersion}`,
    );
  }
  return predictProbability(model, vector.values);
}
