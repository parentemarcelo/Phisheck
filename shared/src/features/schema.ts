/**
 * Feature schema — the single, ordered definition of every model input.
 *
 * Rules:
 * - The ORDER of FEATURES is the order of the model's input vector. Never reorder casually.
 * - Any change to names, order or semantics requires bumping SCHEMA_VERSION, then
 *   re-extracting data, retraining and re-exporting the model.
 * - `NaN` means "missing". The only source of missing values is the absence of a DOM
 *   (URL-only mode): every `dom` feature is then NaN. Ratios with a zero denominator are 0.
 * - URL features always come before DOM features.
 */

export const SCHEMA_VERSION = 2;

export type FeatureGroup = 'url' | 'dom';
export type FeatureKind = 'count' | 'length' | 'ratio' | 'bool' | 'real';

export interface FeatureDef {
  readonly name: string;
  readonly group: FeatureGroup;
  readonly kind: FeatureKind;
  readonly description: string;
}

export const FEATURES = [
  // --- URL: lexical (PLAN 1.3) ---------------------------------------------------------
  {
    name: 'url_length',
    group: 'url',
    kind: 'length',
    description: 'Length of the normalised URL (href).',
  },
  { name: 'hostname_length', group: 'url', kind: 'length', description: 'Length of the hostname.' },
  { name: 'path_length', group: 'url', kind: 'length', description: 'Length of the pathname.' },
  {
    name: 'query_length',
    group: 'url',
    kind: 'length',
    description: 'Length of the query string without "?".',
  },
  { name: 'num_dots', group: 'url', kind: 'count', description: 'Number of "." in the URL.' },
  { name: 'num_hyphens', group: 'url', kind: 'count', description: 'Number of "-" in the URL.' },
  {
    name: 'num_hyphens_host',
    group: 'url',
    kind: 'count',
    description: 'Number of "-" in the hostname.',
  },
  { name: 'num_digits', group: 'url', kind: 'count', description: 'Number of digits in the URL.' },
  {
    name: 'num_digits_host',
    group: 'url',
    kind: 'count',
    description: 'Number of digits in the hostname.',
  },
  {
    name: 'num_underscores',
    group: 'url',
    kind: 'count',
    description: 'Number of "_" in the URL.',
  },
  { name: 'num_tildes', group: 'url', kind: 'count', description: 'Number of "~" in the URL.' },
  { name: 'num_ampersands', group: 'url', kind: 'count', description: 'Number of "&" in the URL.' },
  { name: 'num_percent', group: 'url', kind: 'count', description: 'Number of "%" in the URL.' },
  { name: 'num_at', group: 'url', kind: 'count', description: 'Number of "@" in the URL.' },
  {
    name: 'num_query_params',
    group: 'url',
    kind: 'count',
    description: 'Number of query parameters (duplicates counted).',
  },
  {
    name: 'path_depth',
    group: 'url',
    kind: 'count',
    description: 'Number of non-empty path segments.',
  },
  {
    name: 'has_double_slash_in_path',
    group: 'url',
    kind: 'bool',
    description: 'Pathname contains "//".',
  },

  // --- URL: host (PLAN 1.2 / 1.4) ------------------------------------------------------
  {
    name: 'subdomain_depth',
    group: 'url',
    kind: 'count',
    description:
      'Labels left of the registrable domain (Public Suffix List, private suffixes included), ignoring one leading "www".',
  },
  {
    name: 'is_ip_host',
    group: 'url',
    kind: 'bool',
    description: 'Hostname is an IPv4 or IPv6 address.',
  },
  {
    name: 'is_punycode',
    group: 'url',
    kind: 'bool',
    description: 'A hostname label is punycode ("xn--"), i.e. an IDN.',
  },
  {
    name: 'has_nonstandard_port',
    group: 'url',
    kind: 'bool',
    description: 'URL has an explicit non-default port.',
  },
  {
    name: 'on_private_suffix',
    group: 'url',
    kind: 'bool',
    description:
      'Registrable domain sits on a private PSL suffix (e.g. github.io, web.app, pages.dev).',
  },
  {
    name: 'host_entropy',
    group: 'url',
    kind: 'real',
    description: 'Shannon entropy (bits/char) of the registrable label (domain without suffix).',
  },
  {
    name: 'max_host_label_length',
    group: 'url',
    kind: 'length',
    description: 'Length of the longest hostname label.',
  },
  {
    name: 'suspicious_tld',
    group: 'url',
    kind: 'bool',
    description: 'Top-level domain is in the suspicious-TLD list.',
  },
  {
    name: 'is_shortener',
    group: 'url',
    kind: 'bool',
    description: 'Registrable domain is a known URL shortener.',
  },
  {
    name: 'on_hosting_platform',
    group: 'url',
    kind: 'bool',
    description:
      'Hostname is a tenant of a multi-tenant site/form/file hosting platform (hosting-platforms.json).',
  },

  // --- URL: keywords & brands (PLAN 1.5) -----------------------------------------------
  {
    name: 'num_sensitive_words',
    group: 'url',
    kind: 'count',
    description: 'Distinct sensitive words (login, verify, …) found in the URL.',
  },
  {
    name: 'brand_outside_registered_domain',
    group: 'url',
    kind: 'bool',
    description:
      'A brand token appears in the hostname but the registrable domain is not an official domain of that brand.',
  },
  {
    name: 'brand_in_path',
    group: 'url',
    kind: 'bool',
    description:
      'A brand token appears in the path or query of a domain not official for that brand.',
  },

  // --- DOM: links (PLAN 1.6) -----------------------------------------------------------
  { name: 'num_links', group: 'dom', kind: 'count', description: 'Number of <a href> elements.' },
  {
    name: 'pct_ext_links',
    group: 'dom',
    kind: 'ratio',
    description: 'Share of links to another registrable domain.',
  },
  {
    name: 'pct_null_links',
    group: 'dom',
    kind: 'ratio',
    description: 'Share of null links ("", "#", "javascript:").',
  },
  {
    name: 'pct_self_links',
    group: 'dom',
    kind: 'ratio',
    description: 'Share of links resolving to the current page (ignoring the fragment).',
  },

  // --- DOM: resources (PLAN 1.7) -------------------------------------------------------
  {
    name: 'num_resources',
    group: 'dom',
    kind: 'count',
    description: 'Number of img/script/iframe[src] and resource <link href> elements.',
  },
  {
    name: 'pct_ext_resources',
    group: 'dom',
    kind: 'ratio',
    description: 'Share of resources loaded from another registrable domain.',
  },
  {
    name: 'ext_favicon',
    group: 'dom',
    kind: 'bool',
    description: 'The favicon is loaded from another registrable domain.',
  },

  // --- DOM: forms (PLAN 1.8) -----------------------------------------------------------
  { name: 'num_forms', group: 'dom', kind: 'count', description: 'Number of <form> elements.' },
  {
    name: 'has_password_field',
    group: 'dom',
    kind: 'bool',
    description: 'Page has an <input type=password>.',
  },
  {
    name: 'num_input_fields',
    group: 'dom',
    kind: 'count',
    description: 'Number of user-fillable <input> elements.',
  },
  {
    name: 'form_action_external',
    group: 'dom',
    kind: 'bool',
    description: 'A form submits to another registrable domain.',
  },
  {
    name: 'form_action_mailto',
    group: 'dom',
    kind: 'bool',
    description: 'A form submits to a mailto: address.',
  },
  {
    name: 'form_action_insecure',
    group: 'dom',
    kind: 'bool',
    description: 'On an https page, a form submits over plain http.',
  },
  {
    name: 'form_action_empty',
    group: 'dom',
    kind: 'bool',
    description: 'A form has a missing/empty/"#"/about:blank/javascript: action.',
  },

  // --- DOM: miscellaneous (PLAN 1.9) ---------------------------------------------------
  {
    name: 'num_iframes',
    group: 'dom',
    kind: 'count',
    description: 'Number of <iframe> and <frame> elements.',
  },
  {
    name: 'has_hidden_iframe',
    group: 'dom',
    kind: 'bool',
    description: 'An iframe is hidden (hidden attr, 0/1px size, display:none, visibility:hidden).',
  },
  {
    name: 'missing_title',
    group: 'dom',
    kind: 'bool',
    description: 'The document title is empty.',
  },
  {
    name: 'title_brand_mismatch',
    group: 'dom',
    kind: 'bool',
    description: 'The title names a brand whose official domains do not include this page.',
  },
  {
    name: 'login_brand_mismatch',
    group: 'dom',
    kind: 'bool',
    description:
      'Password field present and title/headings/img alt/og:site_name name a brand not official for this page.',
  },
  {
    name: 'right_click_disabled',
    group: 'dom',
    kind: 'bool',
    description: 'Inline handler or inline script blocks the context menu.',
  },
] as const satisfies readonly FeatureDef[];

type Feature = (typeof FEATURES)[number];
export type FeatureName = Feature['name'];
export type UrlFeatureName = Extract<Feature, { group: 'url' }>['name'];
export type DomFeatureName = Extract<Feature, { group: 'dom' }>['name'];

export type UrlFeatures = Record<UrlFeatureName, number>;
export type DomFeatures = Record<DomFeatureName, number>;

export const FEATURE_NAMES: readonly FeatureName[] = FEATURES.map((f) => f.name);
export const URL_FEATURE_NAMES: readonly UrlFeatureName[] = FEATURES.filter(
  (f): f is Extract<Feature, { group: 'url' }> => f.group === 'url',
).map((f) => f.name);
export const DOM_FEATURE_NAMES: readonly DomFeatureName[] = FEATURES.filter(
  (f): f is Extract<Feature, { group: 'dom' }> => f.group === 'dom',
).map((f) => f.name);

/** A feature vector tagged with the schema version it was produced with. */
export interface FeatureVector {
  readonly schemaVersion: number;
  readonly values: number[];
}

/** DOM features when there is no document: every value missing. */
export function missingDomFeatures(): DomFeatures {
  return Object.fromEntries(DOM_FEATURE_NAMES.map((n) => [n, Number.NaN])) as DomFeatures;
}

/**
 * Builds the ordered vector from per-group results. Throws if any feature is absent or
 * not a number, so a missing implementation can never silently produce a wrong vector.
 */
export function assembleVector(url: UrlFeatures, dom: DomFeatures): FeatureVector {
  const merged: Record<string, number> = { ...url, ...dom };
  const values = FEATURE_NAMES.map((name) => {
    const value = merged[name];
    if (typeof value !== 'number') {
      throw new Error(`Feature "${name}" was not computed`);
    }
    return value;
  });
  return { schemaVersion: SCHEMA_VERSION, values };
}

/** Converts a vector back to a name → value record (debugging, tests, dataset rows). */
export function vectorToRecord(vector: FeatureVector): Record<FeatureName, number> {
  if (vector.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: vector v${vector.schemaVersion}, extractor v${SCHEMA_VERSION}`,
    );
  }
  if (vector.values.length !== FEATURE_NAMES.length) {
    throw new Error(
      `Vector length ${vector.values.length} does not match schema length ${FEATURE_NAMES.length}`,
    );
  }
  return Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, vector.values[i]])) as Record<
    FeatureName,
    number
  >;
}
