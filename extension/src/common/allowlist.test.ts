import { describe, expect, it } from 'vitest';
import { isTrusted, normaliseDomain, normaliseUrl, trustReason } from './allowlist.js';
import type { TrustedDomain } from './settings.js';

const domains = (...entries: [string, boolean][]): TrustedDomain[] =>
  entries.map(([domain, includeSubdomains]) => ({ domain, includeSubdomains }));

describe('trusted URLs (exact)', () => {
  const trustedUrls = ['https://login.example.com/account/signin?next=%2Fhome'];
  const settings = { trustedUrls, trustedDomains: [] };

  it.each<[string, boolean]>([
    ['https://login.example.com/account/signin?next=%2Fhome', true],
    ['https://login.example.com/account/signin?next=%2Fhome#step2', true], // fragment ignored
    ['https://LOGIN.example.com:443/account/signin?next=%2Fhome', true], // case, default port
    ['https://login.example.com/account/signin/?next=%2Fhome', true], // trailing slash
    ['http://login.example.com/account/signin?next=%2Fhome', false], // different scheme
    ['https://login.example.com/account/signin', false], // different query
    ['https://login.example.com/account/signin?next=%2Fother', false],
    ['https://login.example.com/account', false], // different path
    ['https://example.com/account/signin?next=%2Fhome', false], // different host
    ['https://login.example.com:8443/account/signin?next=%2Fhome', false], // different port
  ])('%s → %s', (url, expected) => {
    expect(isTrusted(url, settings)).toBe(expected);
  });

  it('treats the site root with and without slash as the same URL', () => {
    expect(
      isTrusted('https://a.example', { trustedUrls: ['https://a.example/'], trustedDomains: [] }),
    ).toBe(true);
  });
});

describe('trusted domains', () => {
  it.each<[string, TrustedDomain[], boolean]>([
    ['https://example.com/', domains(['example.com', true]), true],
    ['https://login.example.com/x', domains(['example.com', true]), true],
    ['https://a.b.example.com/', domains(['example.com', true]), true],
    ['https://login.example.com/x', domains(['example.com', false]), false], // checkbox off
    ['https://example.com/x', domains(['example.com', false]), true],
    ['http://example.com/', domains(['example.com', false]), true], // any scheme for a domain
    ['https://notexample.com/', domains(['example.com', true]), false], // suffix, not subdomain
    ['https://example.com.evil.xyz/', domains(['example.com', true]), false],
    ['https://example.co/', domains(['example.com', true]), false],
    ['https://login.example.com/', domains(['login.example.com', true]), true],
    ['https://example.com/', domains(['login.example.com', true]), false], // parent not trusted
    ['https://EXAMPLE.com./', domains(['example.com', false]), true], // case, trailing dot
    ['https://xn--bcher-kva.de/', domains(['xn--bcher-kva.de', false]), true],
    ['https://bücher.de/', domains(['xn--bcher-kva.de', false]), true], // URL gives punycode
  ])('%s with %j → %s', (url, trustedDomains, expected) => {
    expect(isTrusted(url, { trustedUrls: [], trustedDomains })).toBe(expected);
  });
});

describe('trustReason', () => {
  it('reports url before domain, and null for non-http(s)', () => {
    const settings = {
      trustedUrls: ['https://example.com/'],
      trustedDomains: domains(['example.com', true]),
    };
    expect(trustReason('https://example.com/', settings)).toBe('url');
    expect(trustReason('https://example.com/other', settings)).toBe('domain');
    expect(trustReason('chrome://settings', settings)).toBeNull();
    expect(trustReason('not a url', settings)).toBeNull();
  });
});

describe('normaliseUrl', () => {
  it.each<[string, string | null]>([
    ['https://Example.com:443/a/?q=1#frag', 'https://example.com/a?q=1'],
    ['http://example.com', 'http://example.com/'],
    ['  https://example.com/a  ', 'https://example.com/a'],
    ['file:///etc/passwd', null],
    ['javascript:alert(1)', null],
    ['example.com', null],
  ])('%s → %s', (input, expected) => {
    expect(normaliseUrl(input)).toBe(expected);
  });
});

describe('normaliseDomain', () => {
  it.each<[string, string | null]>([
    ['example.com', 'example.com'],
    [' Example.COM ', 'example.com'],
    ['*.example.com', 'example.com'],
    ['https://login.example.com/path?q=1', 'login.example.com'],
    ['example.com:8080', 'example.com'],
    ['example.com.', 'example.com'],
    ['bücher.de', 'xn--bcher-kva.de'],
    ['localhost', 'localhost'],
    ['192.168.0.1', '192.168.0.1'],
    ['', null],
    ['   ', null],
    ['exa mple.com', null],
    ['user:pw@example.com', null],
    ['.example.com', null],
    ['a..b', null],
    ['not%20a%20domain', null],
    ['-bad.example', null],
    ['bad-.example', null],
    ['a_b.example.com', 'a_b.example.com'],
    ['[::1]', '[::1]'],
    [`${'a'.repeat(64)}.com`, null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseDomain(input)).toBe(expected);
  });
});
