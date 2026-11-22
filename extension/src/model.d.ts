/**
 * The release model, `models/model.json`, bundled at build time (extension/scripts/build.mjs
 * resolves this module name to the file). Typed as unknown on purpose: `loadModel` validates
 * it, and letting tsc infer the type of a 1.3 MB JSON file would be slow and pointless.
 */
declare module 'phisheck-model' {
  const model: unknown;
  export default model;
}
