import { describe, expect, it } from 'vitest';
import { utf8BytesOver } from './logicFunctionSandbox';

describe('utf8BytesOver', () => {
  it('matches the encoded size at and around the limit', () => {
    const cases = ['a'.repeat(100), 'ş'.repeat(50), '€'.repeat(34), '😀'.repeat(25), 'a'.repeat(33) + '€'];
    for (const text of cases)
      for (const limit of [0, 10, 33, 34, 99, 100, 101, 102, 300]) {
        const bytes = new TextEncoder().encode(text).byteLength;
        expect(utf8BytesOver(text, limit), `${text.slice(0, 4)}… ${limit}`).toBe(bytes > limit);
      }
  });
});
