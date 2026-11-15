import { describe, expect, it } from 'vitest';
import { createLayerOfKind, createProject } from '@ograf-editor/scene-model';
import { buildExportArtifactsWithRuntime } from './buildExportArtifacts';

describe('numeric font variant export validation', () => {
  it('rejects malformed persisted text metadata at the export boundary', () => {
    const project = createProject();
    const composition = project.compositions[0]!;
    const layer = createLayerOfKind('text');
    if (layer.element.type !== 'text') throw new Error('Expected text layer.');
    (layer.element as unknown as Record<string, unknown>).fontVariantNumeric = ['tabular-nums'];
    composition.layers.push(layer);

    const artifacts = buildExportArtifactsWithRuntime(project, composition, '');
    expect(artifacts.valid).toBe(false);
    expect(artifacts.projectErrors.join(' ')).toMatch(/invalid numeric font variant/);
  });
});
