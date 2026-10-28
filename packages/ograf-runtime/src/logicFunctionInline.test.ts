import { describe, expect, it } from 'vitest';
import type { LogicFunctionContext } from '@ograf-editor/scene-model';
import { createInlineLogicFunctionSandbox, isolationBlockedByPolicy } from './logicFunctionSandbox';

// The runtime's tests run in Node: a document is anything that lists its CSP <meta> elements.
const documentWithPolicy = (policy: string | null) =>
  ({
    querySelectorAll: () => (policy === null ? [] : [{ content: policy }]),
  }) as unknown as Document;
const page = documentWithPolicy(null);
const context = (state: unknown = {}): LogicFunctionContext =>
  ({ state, data: { x: 1 }, event: { type: 'data' }, nowMs: 5 }) as unknown as LogicFunctionContext;

describe('isolationBlockedByPolicy', () => {
  it("detects Reality Hub's renderer policy", () => {
    expect(
      isolationBlockedByPolicy(
        documentWithPolicy(
          "default-src 'self'; script-src 'self' 'unsafe-eval'; frame-src 'self'; worker-src 'none'",
        ),
      ),
    ).toBe(true);
  });
  it('allows pages without a policy, or with inline scripts and blob: workers', () => {
    expect(isolationBlockedByPolicy(documentWithPolicy(null))).toBe(false);
    expect(
      isolationBlockedByPolicy(
        documentWithPolicy("script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src blob:"),
      ),
    ).toBe(false);
  });
  it('treats a nonce as disabling unsafe-inline', () => {
    expect(
      isolationBlockedByPolicy(
        documentWithPolicy("script-src 'unsafe-inline' 'nonce-abc'; worker-src blob:"),
      ),
    ).toBe(true);
  });
});

describe('createInlineLogicFunctionSandbox', () => {
  it('runs the Function in the page with a fresh evaluation per call', async () => {
    const sandbox = createInlineLogicFunctionSandbox(page, {
      name: 'Counter',
      source:
        '(() => { let calls = 0; return (ctx) => ({ state: { calls: ++calls, seen: ctx.data.x }, data: { y: ctx.nowMs } }); })()',
    });
    await sandbox.ready;
    expect(await sandbox.invoke(context())).toEqual({
      state: { calls: 1, seen: 1 },
      data: { y: 5 },
    });
    expect(await sandbox.invoke(context())).toEqual({
      state: { calls: 1, seen: 1 },
      data: { y: 5 },
    });
  });
  it('keeps the JSON contract and fails closed', async () => {
    const sandbox = createInlineLogicFunctionSandbox(page, {
      name: 'Bad',
      source: '() => ({ data: { n: NaN } })',
    });
    await expect(sandbox.invoke(context())).rejects.toThrow('Bad: ');
    await expect(sandbox.invoke(context())).rejects.toThrow('Bad: ');
  });
  it('rejects a source that does not compile', async () => {
    const sandbox = createInlineLogicFunctionSandbox(page, { name: 'Broken', source: '(' });
    await expect(sandbox.ready).rejects.toThrow('Broken: ');
  });
});
