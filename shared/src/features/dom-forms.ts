import type { DomContext } from './dom-context.js';
import type { DomFeatures } from './schema.js';

export const FORM_FEATURES = [
  'num_forms',
  'has_password_field',
  'num_input_fields',
  'form_action_external',
  'form_action_mailto',
  'form_action_insecure',
  'form_action_empty',
] as const satisfies readonly (keyof DomFeatures)[];

export type FormFeatures = Pick<DomFeatures, (typeof FORM_FEATURES)[number]>;

/** <input> types the user does not fill in. Missing/unknown types behave as "text". */
const NON_FILLABLE_INPUTS = new Set(['hidden', 'submit', 'button', 'image', 'reset']);
const EMPTY_ACTION = /^(#|about:blank|javascript:.*)$/i;

/**
 * Form submission targets and credential inputs. The action attribute is read raw and
 * resolved against the page URL. "Empty" = missing, "", "#", about:blank or javascript:.
 */
export function formFeatures({ doc, page, resolve }: DomContext): FormFeatures {
  let numFillable = 0;
  let hasPassword = false;
  for (const input of doc.querySelectorAll('input')) {
    const type = (input.getAttribute('type') ?? 'text').trim().toLowerCase();
    if (type === 'password') hasPassword = true;
    if (!NON_FILLABLE_INPUTS.has(type)) numFillable++;
  }

  const forms = doc.querySelectorAll('form');
  let external = false;
  let mailto = false;
  let insecure = false;
  let empty = false;
  for (const form of forms) {
    const action = (form.getAttribute('action') ?? '').trim();
    if (action === '' || EMPTY_ACTION.test(action)) {
      empty = true;
      continue;
    }
    if (/^mailto:/i.test(action)) {
      mailto = true;
      continue;
    }
    const resolved = resolve(action);
    if (resolved?.site == null) continue;
    if (resolved.site !== page.site) external = true;
    if (page.url.protocol === 'https:' && resolved.url.protocol === 'http:') insecure = true;
  }

  return {
    num_forms: forms.length,
    has_password_field: hasPassword ? 1 : 0,
    num_input_fields: numFillable,
    form_action_external: external ? 1 : 0,
    form_action_mailto: mailto ? 1 : 0,
    form_action_insecure: insecure ? 1 : 0,
    form_action_empty: empty ? 1 : 0,
  };
}
