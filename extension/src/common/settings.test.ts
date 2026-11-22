import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage.js';
import {
  addTrustedDomain,
  addTrustedUrl,
  DEFAULT_SETTINGS,
  getSettings,
  InvalidEntryError,
  onSettingsChanged,
  removeTrustedDomain,
  removeTrustedUrl,
  sanitise,
  setEnabled,
  setThreshold,
  type Settings,
} from './settings.js';

describe('defaults', () => {
  it('match the spec: on, 80%, empty allowlists', async () => {
    expect(await getSettings(new MemoryStorage())).toEqual({
      enabled: true,
      threshold: 0.8,
      trustedUrls: [],
      trustedDomains: [],
    });
  });

  it('do not write anything on read', async () => {
    const storage = new MemoryStorage();
    await getSettings(storage);
    expect(storage.writes).toBe(0);
  });
});

describe('sanitise', () => {
  it.each<[string, Record<string, unknown>, Partial<Settings>]>([
    ['non-boolean enabled', { enabled: 'no' }, { enabled: true }],
    ['non-numeric threshold', { threshold: '0.9' }, { threshold: 0.8 }],
    ['NaN threshold', { threshold: NaN }, { threshold: 0.8 }],
    ['threshold above range', { threshold: 1.5 }, { threshold: 0.99 }],
    ['threshold below range', { threshold: 0 }, { threshold: 0.5 }],
    ['non-array trustedUrls', { trustedUrls: 'x' }, { trustedUrls: [] }],
    ['bad and duplicate urls', { trustedUrls: ['a', 3, '', 'a'] }, { trustedUrls: ['a'] }],
    [
      'malformed domains',
      { trustedDomains: [{ domain: 'a.com', includeSubdomains: true }, { domain: 'b.com' }, null] },
      { trustedDomains: [{ domain: 'a.com', includeSubdomains: true }] },
    ],
  ])('%s falls back safely', (_, raw, expected) => {
    expect(sanitise(raw)).toEqual({ ...DEFAULT_SETTINGS, ...expected });
  });
});

describe('updates', () => {
  it('persist each setting', async () => {
    const storage = new MemoryStorage();
    await setEnabled(false, storage);
    await setThreshold(0.9, storage);
    await addTrustedUrl('https://a.example/x', storage);
    await addTrustedDomain('example.com', false, storage);
    expect(await getSettings(storage)).toEqual({
      enabled: false,
      threshold: 0.9,
      trustedUrls: ['https://a.example/x'],
      trustedDomains: [{ domain: 'example.com', includeSubdomains: false }],
    });
  });

  it('do not duplicate entries and replace a domain entry', async () => {
    const storage = new MemoryStorage();
    await addTrustedUrl('https://a.example/', storage);
    await addTrustedUrl('https://a.example/', storage);
    await addTrustedDomain('example.com', true, storage);
    await addTrustedDomain('example.com', false, storage);
    const s = await getSettings(storage);
    expect(s.trustedUrls).toEqual(['https://a.example/']);
    expect(s.trustedDomains).toEqual([{ domain: 'example.com', includeSubdomains: false }]);
  });

  it('remove entries', async () => {
    const storage = new MemoryStorage({
      trustedUrls: ['https://a.example/', 'https://b.example/'],
      trustedDomains: [{ domain: 'example.com', includeSubdomains: true }],
    });
    await removeTrustedUrl('https://a.example/', storage);
    await removeTrustedDomain('example.com', storage);
    const s = await getSettings(storage);
    expect(s.trustedUrls).toEqual(['https://b.example/']);
    expect(s.trustedDomains).toEqual([]);
  });

  it('do not lose concurrent additions', async () => {
    const storage = new MemoryStorage();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => addTrustedUrl(`https://site${i}.example/`, storage)),
    );
    expect((await getSettings(storage)).trustedUrls).toHaveLength(20);
  });

  it('store canonical entries and reject invalid ones', async () => {
    const storage = new MemoryStorage();
    await addTrustedUrl('https://A.example/login/#x', storage);
    await addTrustedDomain('*.Bücher.de', true, storage);
    const s = await getSettings(storage);
    expect(s.trustedUrls).toEqual(['https://a.example/login/']); // as seen, minus fragment
    await addTrustedUrl('https://a.example/login', storage); // same page: replaces it
    expect((await getSettings(storage)).trustedUrls).toEqual(['https://a.example/login']);
    expect(s.trustedDomains).toEqual([{ domain: 'xn--bcher-kva.de', includeSubdomains: true }]);
    await expect(addTrustedUrl('chrome://settings', storage)).rejects.toThrow(InvalidEntryError);
    await expect(addTrustedDomain('a b', true, storage)).rejects.toThrow(InvalidEntryError);
  });

  it('clamp the threshold', async () => {
    const storage = new MemoryStorage();
    expect((await setThreshold(0.2, storage)).threshold).toBe(0.5);
  });
});

describe('change events', () => {
  it('deliver the full new settings and the changed keys', async () => {
    const storage = new MemoryStorage();
    const callback = vi.fn();
    const stop = onSettingsChanged(callback, storage);
    await setEnabled(false, storage);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(callback).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, enabled: false }, ['enabled']);

    stop();
    await setEnabled(true, storage);
    await new Promise((r) => setTimeout(r, 10));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignore unrelated keys', async () => {
    const storage = new MemoryStorage();
    const callback = vi.fn();
    onSettingsChanged(callback, storage);
    await storage.set({ somethingElse: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(callback).not.toHaveBeenCalled();
  });
});
