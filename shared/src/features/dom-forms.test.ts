import { describe, expect, it } from 'vitest';
import { FORM_FEATURES, formFeatures } from './dom-forms.js';
import { domContext } from './testing/dom.js';

const HTTPS_PAGE = 'https://www.example.com/login.html';
const forms = (body: string, url = HTTPS_PAGE) =>
  formFeatures(domContext(`<body>${body}</body>`, url));
const form = (action: string | null) =>
  action === null
    ? '<form><input name="q"></form>'
    : `<form action="${action}"><input name="q"></form>`;

describe('formFeatures', () => {
  it('computes every form feature', () => {
    expect(Object.keys(forms('')).sort()).toEqual([...FORM_FEATURES].sort());
  });

  it('returns zeros for a page without forms or inputs', () => {
    expect(forms('<p>hi</p>')).toEqual({
      num_forms: 0,
      has_password_field: 0,
      num_input_fields: 0,
      form_action_external: 0,
      form_action_mailto: 0,
      form_action_insecure: 0,
      form_action_empty: 0,
    });
  });

  it('detects password fields (case-insensitive type), inside or outside forms', () => {
    expect(forms('<input type="PASSWORD">').has_password_field).toBe(1);
    expect(forms('<form action="/s"><input type="password"></form>').has_password_field).toBe(1);
    expect(forms('<input type="text">').has_password_field).toBe(0);
  });

  it('counts only user-fillable inputs', () => {
    const f = forms(
      [
        '<input>',
        '<input type="email">',
        '<input type="password">',
        '<input type="unknown-type">',
        '<input type="checkbox">',
        '<input type="hidden">',
        '<input type="submit">',
        '<input type="button">',
        '<input type="image">',
        '<input type="reset">',
      ].join(''),
    );
    expect(f.num_input_fields).toBe(5);
  });

  it.each([
    // action, expected flags
    [null, { form_action_empty: 1 }],
    ['', { form_action_empty: 1 }],
    ['#', { form_action_empty: 1 }],
    ['about:blank', { form_action_empty: 1 }],
    ['JavaScript:void(0)', { form_action_empty: 1 }],
    ['mailto:attacker@example.net', { form_action_mailto: 1, form_action_empty: 0 }],
    ['/session', { form_action_external: 0, form_action_insecure: 0, form_action_empty: 0 }],
    ['https://auth.example.com/post', { form_action_external: 0 }],
    [
      'https://collect.evil.example.org/p.php',
      { form_action_external: 1, form_action_insecure: 0 },
    ],
    ['http://www.example.com/post', { form_action_external: 0, form_action_insecure: 1 }],
    ['http://evil.example.org/p.php', { form_action_external: 1, form_action_insecure: 1 }],
  ] as const)('action %j', (action, flags) => {
    expect(forms(form(action))).toMatchObject({ num_forms: 1, ...flags });
  });

  it('does not flag http actions as insecure on an http page', () => {
    expect(
      forms(form('http://www.example.com/post'), 'http://www.example.com/').form_action_insecure,
    ).toBe(0);
  });

  it('combines flags across several forms', () => {
    const f = forms(form('/search') + form('mailto:a@b.c') + form('https://evil.example.org/'));
    expect(f).toMatchObject({
      num_forms: 3,
      form_action_external: 1,
      form_action_mailto: 1,
      form_action_empty: 0,
    });
  });
});
