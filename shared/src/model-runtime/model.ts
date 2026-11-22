/**
 * The exported model format (`models/model.json`, written by the training pipeline's exporter) and
 * its parsed, ready-to-evaluate form. Parsing checks the structure fully, so evaluation can
 * index arrays without bounds checks and every tree walk is guaranteed to end at a leaf.
 */

export const MODEL_FORMAT = 'phisheck-lightgbm';
export const MODEL_FORMAT_VERSION = 1;

/** How a split treats missing values; same codes as LightGBM's MissingType. */
export const MissingType = { None: 0, Zero: 1, NaN: 2 } as const;
export type MissingType = (typeof MissingType)[keyof typeof MissingType];

/** JSON shape of one tree: parallel arrays over internal nodes; child < 0 means leaf ~child. */
export interface TreeJson {
  split_feature: number[];
  threshold: number[];
  missing_type: number[];
  default_left: number[];
  left: number[];
  right: number[];
  leaf_value: number[];
}

export interface ModelJson {
  format: string;
  format_version: number;
  schema_version: number;
  feature_names: string[];
  objective: { type: string; sigmoid: number };
  metadata: Record<string, unknown>;
  trees: TreeJson[];
}

export interface Tree {
  readonly splitFeature: Int32Array;
  readonly threshold: Float64Array;
  readonly missingType: Uint8Array;
  readonly defaultLeft: Uint8Array;
  readonly left: Int32Array;
  readonly right: Int32Array;
  readonly leafValue: Float64Array;
}

export interface Model {
  readonly schemaVersion: number;
  readonly featureNames: readonly string[];
  readonly sigmoid: number;
  readonly trees: readonly Tree[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export class ModelFormatError extends Error {
  override name = 'ModelFormatError';
}

function fail(message: string): never {
  throw new ModelFormatError(`invalid model: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown, what: string, integer: boolean): number[] {
  if (!Array.isArray(value)) fail(`${what} is not an array`);
  for (const v of value) {
    if (typeof v !== 'number' || !Number.isFinite(v) || (integer && !Number.isInteger(v))) {
      fail(`${what} contains ${JSON.stringify(v)}`);
    }
  }
  return value as number[];
}

function parseTree(json: unknown, index: number, featureCount: number): Tree {
  const what = `trees[${index}]`;
  if (!isRecord(json)) fail(`${what} is not an object`);
  const splitFeature = numberArray(json.split_feature, `${what}.split_feature`, true);
  const threshold = numberArray(json.threshold, `${what}.threshold`, false);
  const missingType = numberArray(json.missing_type, `${what}.missing_type`, true);
  const defaultLeft = numberArray(json.default_left, `${what}.default_left`, true);
  const left = numberArray(json.left, `${what}.left`, true);
  const right = numberArray(json.right, `${what}.right`, true);
  const leafValue = numberArray(json.leaf_value, `${what}.leaf_value`, false);

  const internal = splitFeature.length;
  for (const [name, arr] of [
    ['threshold', threshold],
    ['missing_type', missingType],
    ['default_left', defaultLeft],
    ['left', left],
    ['right', right],
  ] as const) {
    if (arr.length !== internal)
      fail(`${what}.${name} has ${arr.length} entries, expected ${internal}`);
  }
  if (leafValue.length !== internal + 1) {
    fail(`${what} has ${leafValue.length} leaves for ${internal} splits`);
  }
  for (let n = 0; n < internal; n++) {
    const f = splitFeature[n] ?? -1;
    const mt = missingType[n] ?? -1;
    if (f < 0 || f >= featureCount) fail(`${what} node ${n} splits on feature ${f}`);
    if (mt > MissingType.NaN || mt < 0) {
      fail(`${what} node ${n} has missing_type ${mt}`);
    }
    if (defaultLeft[n] !== 0 && defaultLeft[n] !== 1)
      fail(`${what} node ${n} default_left is not 0/1`);
    for (const child of [left[n] ?? n, right[n] ?? n]) {
      // Internal children always come after their parent (LightGBM numbers nodes in split
      // order), which rules out cycles: every walk strictly advances and ends at a leaf.
      if (child >= 0 ? child <= n || child >= internal : ~child >= leafValue.length) {
        fail(`${what} node ${n} has child ${child}`);
      }
    }
  }
  return {
    splitFeature: Int32Array.from(splitFeature),
    threshold: Float64Array.from(threshold),
    missingType: Uint8Array.from(missingType),
    defaultLeft: Uint8Array.from(defaultLeft),
    left: Int32Array.from(left),
    right: Int32Array.from(right),
    leafValue: Float64Array.from(leafValue),
  };
}

/** Validates parsed `model.json` content and converts it to typed arrays. */
export function parseModel(json: unknown): Model {
  if (!isRecord(json)) fail('not an object');
  if (json.format !== MODEL_FORMAT)
    fail(`format is ${JSON.stringify(json.format)}, expected "${MODEL_FORMAT}"`);
  if (json.format_version !== MODEL_FORMAT_VERSION) {
    fail(
      `format_version ${JSON.stringify(json.format_version)} is not supported (expected ${MODEL_FORMAT_VERSION})`,
    );
  }
  const schemaVersion = json.schema_version;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    fail('schema_version is not a positive integer');
  }
  const names = json.feature_names;
  if (!Array.isArray(names) || names.length === 0 || !names.every((n) => typeof n === 'string')) {
    fail('feature_names is not a non-empty list of strings');
  }
  const objective = json.objective;
  if (!isRecord(objective) || objective.type !== 'binary') fail('objective is not binary');
  const sigmoid = objective.sigmoid;
  if (typeof sigmoid !== 'number' || !(sigmoid > 0) || !Number.isFinite(sigmoid)) {
    fail('objective.sigmoid is not a positive number');
  }
  if (!Array.isArray(json.trees) || json.trees.length === 0) fail('trees is empty');
  const metadata = isRecord(json.metadata) ? json.metadata : {};

  return {
    schemaVersion,
    featureNames: Object.freeze([...(names as string[])]),
    sigmoid,
    trees: json.trees.map((t, i) => parseTree(t, i, names.length)),
    metadata,
  };
}
