import type { StorageAreaLike, StorageChange } from '../common/settings.js';

type Listener = (changes: Record<string, StorageChange>) => void;

/**
 * In-memory stand-in for a `chrome.storage` area in unit tests. Values are structured-cloned
 * like the real API, and `onChanged` fires asynchronously with only the keys whose value
 * actually changed.
 */
export class MemoryStorage implements StorageAreaLike {
  readonly data = new Map<string, unknown>();
  private readonly listeners = new Set<Listener>();
  writes = 0;

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, structuredClone(v));
  }

  get(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return Promise.resolve(out);
  }

  set(items: Record<string, unknown>): Promise<void> {
    this.writes++;
    const changes: Record<string, StorageChange> = {};
    for (const [k, v] of Object.entries(items)) {
      const old = this.data.get(k);
      if (JSON.stringify(old) === JSON.stringify(v)) continue;
      changes[k] = { oldValue: structuredClone(old), newValue: structuredClone(v) };
      this.data.set(k, structuredClone(v));
    }
    if (Object.keys(changes).length > 0) {
      queueMicrotask(() => this.listeners.forEach((l) => l(changes)));
    }
    return Promise.resolve();
  }

  onChanged = {
    addListener: (l: Listener) => void this.listeners.add(l),
    removeListener: (l: Listener) => void this.listeners.delete(l),
  };
}
