import { expect, it } from 'vitest';
import { createProject, effectProperty } from '@ograf-editor/scene-model';
import { AuthoringSession } from './session';

it('owns effect instances in atomic undoable edits without touching other property tracks', () => {
  const session = new AuthoringSession(createProject());
  const first = session.apply({
    expectedRevision: 0,
    operations: [{ type: 'add_layer', kind: 'rectangle', name: 'Tile' }],
  });
  const layer = first.project.compositions[0]!.layers[0]!;
  const added = session.apply({
    expectedRevision: 1,
    operations: [
      {
        type: 'add_effect',
        layerId: layer.id,
        effectType: 'glow',
        patch: { name: 'Bloom', params: { radius: 10 } },
      },
    ],
  });
  const fx = added.project.compositions[0]!.layers[0]!.effects.stack!.at(-1)!;
  expect(added.summary.generatedIds).toContainEqual(
    expect.objectContaining({ kind: 'effect', id: fx.id }),
  );
  const before = structuredClone(added.project.compositions[0]!.layers[0]!.animationTracks);
  const changed = session.apply({
    expectedRevision: 2,
    operations: [
      {
        type: 'update_effect',
        layerId: layer.id,
        effectId: fx.id,
        patch: { params: { radius: 20 } },
      },
      {
        type: 'reorder_effects',
        layerId: layer.id,
        effectIds: [fx.id, 'base-shadow', 'base-blur'],
      },
    ],
  });
  expect(changed.validation.valid).toBe(true);
  const tracks = changed.project.compositions[0]!.layers[0]!.animationTracks;
  expect(tracks.x).toEqual(before.x);
  expect(tracks.opacity).toEqual(before.opacity);
  expect(
    tracks[effectProperty(fx, 'radius') as `effects.${string}.${string}`]!.every(
      (k) => k.value === 20,
    ),
  ).toBe(true);
  expect(session.undo(3).project).toEqual(added.project);
});

it('authors a post-process shader effect with editable source and incoming iChannel0', () => {
  const session = new AuthoringSession(createProject());
  const created = session.apply({
    expectedRevision: 0,
    operations: [{ type: 'add_layer', kind: 'text', name: 'Headline' }],
  });
  const layer = created.project.compositions[0]!.layers[0]!;
  const added = session.apply({
    expectedRevision: 1,
    operations: [
      {
        type: 'add_effect',
        layerId: layer.id,
        effectType: 'shader',
        patch: { blendMode: 'normal' },
      },
    ],
  });
  const effect = added.project.compositions[0]!.layers[0]!.effects.stack!.at(-1)!;
  expect(effect.shader?.fragmentSource).toContain('texture(iChannel0');
  const revised = session.apply({
    expectedRevision: 2,
    operations: [
      {
        type: 'update_effect',
        layerId: layer.id,
        effectId: effect.id,
        patch: {
          shader: {
            ...effect.shader!,
            fragmentSource:
              'void mainImage(out vec4 c, in vec2 p) { vec4 s = texture(iChannel0, p / iResolution.xy); c = vec4(1.0 - s.rgb, s.a); }',
          },
        },
      },
    ],
  });
  expect(revised.validation.valid).toBe(true);
  expect(
    revised.project.compositions[0]!.layers[0]!.effects.stack!.at(-1)!.shader?.fragmentSource,
  ).toContain('1.0 - s.rgb');
});

it('rejects a reorder that repeats an effect id without committing', () => {
  const session = new AuthoringSession(createProject());
  session.apply({
    expectedRevision: 0,
    operations: [{ type: 'add_layer', kind: 'rectangle', name: 'A' }],
  });
  const layers = session.snapshot().project.compositions[0]!.layers;
  const [a] = layers;
  const grouped = session.apply({
    expectedRevision: session.revision,
    operations: [
      { type: 'add_effect', layerId: a!.id, effectType: 'glow', patch: { name: 'One' } },
    ],
  });
  const stack = grouped.project.compositions[0]!.layers.find((layer) => layer.id === a!.id)!.effects
    .stack!;
  const ids = stack.map((effect) => effect.id);
  const before = session.snapshot();

  for (const effectIds of [
    [...ids, ids[0]!],
    [ids[0]!, ids[0]!],
  ]) {
    expect(() =>
      session.apply({
        expectedRevision: before.revision,
        operations: [{ type: 'reorder_effects', layerId: a!.id, effectIds }],
      }),
    ).toThrow(/each supplied effect ID exactly once/);
    expect(session.revision).toBe(before.revision);
    expect(session.snapshot().project).toEqual(before.project);
  }

  const reordered = session.apply({
    expectedRevision: before.revision,
    operations: [{ type: 'reorder_effects', layerId: a!.id, effectIds: [...ids].reverse() }],
  });
  expect(
    reordered.project.compositions[0]!.layers.find(
      (layer) => layer.id === a!.id,
    )!.effects.stack!.map((effect) => effect.id),
  ).toEqual([...ids].reverse());
});
