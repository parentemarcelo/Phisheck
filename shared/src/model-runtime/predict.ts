import { MissingType, type Model, type Tree } from './model.js';

/** LightGBM's kZeroThreshold: values this close to 0 count as zero for MissingType.Zero. */
const ZERO_THRESHOLD = 1e-35;

// Index fallbacks below (`?? …`) are unreachable: parseModel checks every index and length.

/**
 * One split, exactly as LightGBM's `Tree::NumericalDecision`: NaN is read as 0 unless the
 * split has a NaN branch; a "missing" value takes the default branch; otherwise `x <= t`.
 */
function goesLeft(tree: Tree, node: number, value: number): boolean {
  const missingType = tree.missingType[node];
  let x = value;
  if (Number.isNaN(x) && missingType !== MissingType.NaN) x = 0;
  if (
    (missingType === MissingType.Zero && x >= -ZERO_THRESHOLD && x <= ZERO_THRESHOLD) ||
    (missingType === MissingType.NaN && Number.isNaN(x))
  ) {
    return tree.defaultLeft[node] === 1;
  }
  return x <= (tree.threshold[node] ?? NaN);
}

function leafValue(tree: Tree, features: ArrayLike<number>): number {
  let node = 0;
  if (tree.splitFeature.length > 0) {
    // parseModel guarantees children advance, so this loop always reaches a leaf.
    while (node >= 0) {
      const value = features[tree.splitFeature[node] ?? 0] ?? NaN;
      node = (goesLeft(tree, node, value) ? tree.left[node] : tree.right[node]) ?? -1;
    }
    node = ~node;
  }
  return tree.leafValue[node] ?? 0;
}

function checkWidth(model: Model, features: ArrayLike<number>): void {
  if (features.length !== model.featureNames.length) {
    throw new RangeError(`expected ${model.featureNames.length} features, got ${features.length}`);
  }
}

/** Sum of the trees' leaf values (log-odds), summed in tree order like LightGBM. */
export function rawScore(model: Model, features: ArrayLike<number>): number {
  checkWidth(model, features);
  let sum = 0;
  for (const tree of model.trees) sum += leafValue(tree, features);
  return sum;
}

/** Phishing probability in [0, 1]. Missing features are NaN. */
export function predictProbability(model: Model, features: ArrayLike<number>): number {
  return 1 / (1 + Math.exp(-model.sigmoid * rawScore(model, features)));
}
