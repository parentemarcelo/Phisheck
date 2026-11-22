import { describe, expect, it } from 'vitest';
import platformCases from '../../fixtures/hosting-platform-cases.json' with { type: 'json' };
import { HOST_FEATURES, hostFeatures, shannonEntropy } from './url-host.js';
import { parseUrl } from './url-parts.js';

const host = (url: string) => hostFeatures(parseUrl(url));

describe('shannonEntropy', () => {
  it.each([
    ['', 0],
    ['aaaa', 0],
    ['ab', 1],
    ['abcd', 2],
    ['aabb', 1],
  ])('%j → %d', (text, bits) => {
    expect(shannonEntropy(text)).toBeCloseTo(bits, 12);
  });
});

describe('hostFeatures', () => {
  it('computes every host feature', () => {
    expect(Object.keys(host('https://example.com/')).sort()).toEqual([...HOST_FEATURES].sort());
  });

  it('ordinary host', () => {
    expect(host('https://www.example.com/')).toEqual({
      subdomain_depth: 0,
      is_ip_host: 0,
      is_punycode: 0,
      has_nonstandard_port: 0,
      on_private_suffix: 0,
      host_entropy: shannonEntropy('example'),
      max_host_label_length: 7,
      suspicious_tld: 0,
      is_shortener: 0,
      on_hosting_platform: 0,
    });
  });

  it.each(platformCases.cases as [string, boolean][])(
    'on_hosting_platform %s → %s',
    (url, expected) => {
      expect(host(url).on_hosting_platform).toBe(expected ? 1 : 0);
    },
  );

  it.each([
    ['http://192.168.0.1/', { is_ip_host: 1, suspicious_tld: 0, subdomain_depth: 0 }],
    ['http://[2001:db8::1]/', { is_ip_host: 1, suspicious_tld: 0 }],
    ['https://xn--pypal-4ve.com/', { is_punycode: 1 }],
    ['https://раураl.com/', { is_punycode: 1 }],
    ['https://example.com:8443/', { has_nonstandard_port: 1 }],
    ['https://example.com:443/', { has_nonstandard_port: 0 }],
    ['http://example.com:80/', { has_nonstandard_port: 0 }],
    ['https://victim.github.io/', { on_private_suffix: 1, subdomain_depth: 0 }],
    ['https://a.b.c.example.co.uk/', { subdomain_depth: 3, max_host_label_length: 7 }],
    ['https://login-secure.example.xyz/', { suspicious_tld: 1, max_host_label_length: 12 }],
    ['https://example.co.uk/', { suspicious_tld: 0 }],
    ['https://EXAMPLE.TOP./', { suspicious_tld: 1 }],
    ['https://bit.ly/abc', { is_shortener: 1 }],
    ['https://www.tinyurl.com/abc', { is_shortener: 1 }],
    ['https://notbit.ly.example.com/', { is_shortener: 0 }],
    ['https://aaaaaaaa.com/', { host_entropy: 0 }],
    ['https://x7k2q9zt4m.com/', { host_entropy: shannonEntropy('x7k2q9zt4m') }],
  ] as const)('%s', (url, subset) => {
    expect(host(url)).toMatchObject(subset);
  });

  it('scores random-looking registrable labels higher than words', () => {
    expect(host('https://x7k2q9zt4m.com/').host_entropy).toBeGreaterThan(
      host('https://google.com/').host_entropy,
    );
  });
});
