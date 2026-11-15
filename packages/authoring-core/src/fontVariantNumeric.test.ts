import { describe, expect, it } from 'vitest';
import { createMediaPaint, createProject, createShaderPaint } from '@ograf-editor/scene-model';
import { validateProject } from '@ograf-editor/validation';
import { AuthoringSession } from './session';

function sessionWithText() {
  const session = new AuthoringSession(createProject(), 'numeric-variant');
  const created = session.apply({
    expectedRevision: 0,
    operations: [{ type: 'add_layer', kind: 'text', name: 'Score' }],
  });
  return { session, layerId: created.summary.generatedIds[0]!.id };
}

describe('text fontVariantNumeric authoring', () => {
  it('stores each allowed variant and keeps omission as the default', () => {
    const { session, layerId } = sessionWithText();
    expect(session.snapshot().project.compositions[0]!.layers[0]!.element).not.toHaveProperty(
      'fontVariantNumeric',
    );
    for (const variant of ['tabular-nums', 'proportional-nums', 'normal'] as const) {
      const result = session.apply({
        expectedRevision: session.revision,
        operations: [{ type: 'update_element', layerId, patch: { fontVariantNumeric: variant } }],
      });
      expect(result.project.compositions[0]!.layers[0]!.element).toMatchObject({
        type: 'text',
        fontVariantNumeric: variant,
      });
    }
  });

  it('accepts a variant when the text layer is created', () => {
    const session = new AuthoringSession(createProject(), 'numeric-variant-add');
    const result = session.apply({
      expectedRevision: 0,
      operations: [
        { type: 'add_layer', kind: 'text', element: { fontVariantNumeric: 'tabular-nums' } },
      ],
    });
    expect(result.project.compositions[0]!.layers[0]!.element).toMatchObject({
      fontVariantNumeric: 'tabular-nums',
    });
  });

  it('rejects values outside the three variants without committing', () => {
    const { session, layerId } = sessionWithText();
    const before = session.snapshot();
    for (const fontVariantNumeric of ['tabular', 700, null, [], {}]) {
      expect(() =>
        session.apply({
          expectedRevision: before.revision,
          operations: [{ type: 'update_element', layerId, patch: { fontVariantNumeric } }],
        }),
      ).toThrow(/fontVariantNumeric/);
      expect(session.revision).toBe(before.revision);
      expect(session.snapshot().project).toEqual(before.project);
    }
  });

  it('refuses a non-normal variant together with shader or media text paint', () => {
    const { session, layerId } = sessionWithText();
    const before = session.snapshot();
    for (const patch of [
      { fontVariantNumeric: 'tabular-nums', fill: createShaderPaint() },
      { fontVariantNumeric: 'proportional-nums', fill: createMediaPaint() },
      { fontVariantNumeric: 'tabular-nums', strokePaint: createShaderPaint() },
    ]) {
      expect(() =>
        session.apply({
          expectedRevision: before.revision,
          operations: [{ type: 'update_element', layerId, patch }],
        }),
      ).toThrow(/Canvas-masked text paint/);
      expect(session.revision).toBe(before.revision);
      expect(session.snapshot().project).toEqual(before.project);
    }
  });

  it('flags malformed persisted variants and masked paint in project validation', () => {
    const { session, layerId } = sessionWithText();
    const project = structuredClone(session.snapshot().project);
    const element = project.compositions[0]!.layers.find((layer) => layer.id === layerId)!
      .element as unknown as Record<string, unknown>;

    element.fontVariantNumeric = 'tabular';
    expect(validateProject(project).errors.join(' ')).toMatch(/invalid numeric font variant/);

    element.fontVariantNumeric = 'tabular-nums';
    element.fill = createMediaPaint();
    expect(validateProject(project).errors.join(' ')).toMatch(
      /non-normal numeric font variant with Canvas-masked text paint/,
    );

    element.fill = '#ffffff';
    expect(validateProject(project).errors.join(' ')).not.toMatch(/numeric font variant/);
  });
});
