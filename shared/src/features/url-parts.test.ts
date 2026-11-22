import { describe, expect, it } from 'vitest';
import { createSiteResolver, InvalidUrlError, parseUrl, subdomainDepth } from './url-parts.js';

describe('parseUrl', () => {
  it.each([
    // url, domain, site, subdomain labels, depth
    ['https://www.example.com/', 'example.com', 'example.com', ['www'], 0],
    ['https://a.b.example.co.uk/x', 'example.co.uk', 'example.co.uk', ['a', 'b'], 2],
    ['https://www.login.example.com/', 'example.com', 'example.com', ['www', 'login'], 1],
    ['https://login.www.example.com/', 'example.com', 'example.com', ['login', 'www'], 2],
    ['https://example.com./', 'example.com', 'example.com', [], 0],
    ['http://192.168.0.1/login', null, '192.168.0.1', [], 0],
    ['http://[::1]:8080/', null, '[::1]', [], 0],
    ['http://localhost:3000/', null, 'localhost', [], 0],
    ['https://victim.github.io/', 'victim.github.io', 'victim.github.io', [], 0],
    ['https://x.y.pages.dev/', 'y.pages.dev', 'y.pages.dev', ['x'], 1],
  ] as const)('%s', (input, domain, site, labels, depth) => {
    const p = parseUrl(input);
    expect(p.domain).toBe(domain);
    expect(p.site).toBe(site);
    expect(p.subdomainLabels).toEqual(labels);
    expect(subdomainDepth(p)).toBe(depth);
  });

  it('detects IPv4 and IPv6 hosts, including non-canonical IPv4 forms', () => {
    expect(parseUrl('http://192.168.0.1/').isIp).toBe(true);
    expect(parseUrl('http://[2001:db8::1]/').isIp).toBe(true);
    const hex = parseUrl('http://0x7f.1/');
    expect(hex.hostname).toBe('127.0.0.1');
    expect(hex.isIp).toBe(true);
    expect(parseUrl('https://example.com/').isIp).toBe(false);
  });

  it('normalises IDN hosts to punycode', () => {
    const p = parseUrl('https://münchen.de/');
    expect(p.hostname).toBe('xn--mnchen-3ya.de');
    expect(p.domainWithoutSuffix).toBe('xn--mnchen-3ya');
  });

  it('normalises case, keeps ports and credentials in href', () => {
    const p = parseUrl('HTTP://User:Pw@WWW.Example.COM:8443/A b?q=1');
    expect(p.hostname).toBe('www.example.com');
    expect(p.href).toBe('http://User:Pw@www.example.com:8443/A%20b?q=1');
    expect(p.url.port).toBe('8443');
  });

  it('drops the fragment', () => {
    const p = parseUrl('https://example.com/a?b=1#login@evil');
    expect(p.href).toBe('https://example.com/a?b=1');
    expect(p.url.hash).toBe('');
  });

  it('flags private suffixes', () => {
    expect(parseUrl('https://victim.github.io/').isPrivateSuffix).toBe(true);
    expect(parseUrl('https://www.example.com/').isPrivateSuffix).toBe(false);
    expect(parseUrl('https://www.example.com/').publicSuffix).toBe('com');
  });

  it.each([
    'not a url',
    '/relative/path',
    'ftp://example.com/',
    'javascript:alert(1)',
    'file:///etc/passwd',
  ])('rejects %s', (input) => {
    expect(() => parseUrl(input)).toThrow(InvalidUrlError);
  });
});

describe('createSiteResolver', () => {
  const resolve = createSiteResolver(new URL('https://shop.example.com/a/b.html'));

  it('resolves relative links against the base', () => {
    expect(resolve('/login')?.site).toBe('example.com');
    expect(resolve('c.html')?.url.href).toBe('https://shop.example.com/a/c.html');
    expect(resolve('//cdn.example.com/x.js')?.site).toBe('example.com');
  });

  it('returns the registrable domain of absolute links', () => {
    expect(resolve('https://evil.example.net/')?.site).toBe('example.net');
    expect(resolve('http://10.0.0.1/x')?.site).toBe('10.0.0.1');
  });

  it('returns site null for non-http(s) schemes', () => {
    expect(resolve('mailto:a@b.c')?.site).toBeNull();
    expect(resolve('javascript:void(0)')?.site).toBeNull();
    expect(resolve('data:image/png;base64,AA==')?.site).toBeNull();
  });

  it('returns null for unparseable hrefs', () => {
    expect(resolve('http://[bad')).toBeNull();
  });
});
