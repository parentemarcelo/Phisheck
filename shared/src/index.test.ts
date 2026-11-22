import { describe, expect, it } from 'vitest';
import { PROJECT_NAME } from './index.js';

describe('workspace smoke test', () => {
  it('resolves shared modules', () => {
    expect(PROJECT_NAME).toBe('phisheck');
  });
});
