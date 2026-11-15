import { describe, expect, it } from 'vitest';
import {
  createAsset,
  createComposition,
  createFieldDefinition,
  createLayerOfKind,
} from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled binding contract', () => {
  it('resolves the public field key and preserves the authored target, path, and value map', () => {
    const field = createFieldDefinition('object', { key: 'identity' });
    const layer = createLayerOfKind('text');
    const sourcePath = ['status', 'label'];
    const valueMap = { live: '#d62839', off: '#6d7280' };
    layer.bindings = [
      {
        fieldId: field.id,
        targetProperty: 'color',
        sourcePath,
        valueMap,
      },
    ];

    const compiled = compileDescriptor(createComposition({ layers: [layer], dataFields: [field] }));
    const binding = compiled.layers[0]!.bindings[0]!;

    expect(binding).toEqual({
      dataKey: 'identity',
      targetProperty: 'color',
      sourcePath: ['status', 'label'],
      valueMap: { live: '#d62839', off: '#6d7280' },
    });
    expect(binding).not.toHaveProperty('fieldId');
    expect(binding.sourcePath).not.toBe(sourcePath);
    expect(binding.valueMap).not.toBe(valueMap);
  });

  it('omits an item index for an ordinary binding; collection expansion owns that runtime field', () => {
    const field = createFieldDefinition('text', { key: 'headline' });
    const layer = createLayerOfKind('text');
    layer.bindings = [{ fieldId: field.id, targetProperty: 'content' }];

    const binding = compileDescriptor(createComposition({ layers: [layer], dataFields: [field] }))
      .layers[0]!.bindings[0]!;

    expect(binding).toEqual({ dataKey: 'headline', targetProperty: 'content' });
    expect(binding).not.toHaveProperty('itemIndex');
  });

  it('drops a binding when its native field ID cannot resolve to a public payload key', () => {
    const layer = createLayerOfKind('text');
    layer.bindings = [{ fieldId: 'deleted-field-id', targetProperty: 'content' }];

    const compiled = compileDescriptor(createComposition({ layers: [layer], dataFields: [] }));

    expect(compiled.layers[0]!.bindings).toEqual([]);
  });
});

describe('compiled font resource contract', () => {
  it('compiles every explicit runtime face descriptor from the registered font asset', () => {
    const font = createAsset({
      id: 'font-archivo-bold',
      name: 'Archivo-Bold.woff2',
      kind: 'font',
      mimeType: 'font/woff2',
      fontFamily: 'Archivo',
      fontWeight: '700',
      fontStyle: 'italic',
    });

    const compiled = compileDescriptor(createComposition({ assets: [font] }));

    expect(compiled.fonts).toEqual([
      {
        family: 'Archivo',
        source: 'asset:font-archivo-bold',
        mimeType: 'font/woff2',
        weight: '700',
        style: 'italic',
      },
    ]);
  });

  it('derives family and face defaults when optional font metadata is absent', () => {
    const font = createAsset({
      id: 'font-archivo-variable',
      name: 'ArchivoVariable.ttf',
      kind: 'font',
      mimeType: 'font/ttf',
    });

    const compiled = compileDescriptor(createComposition({ assets: [font] }));

    expect(compiled.fonts).toEqual([
      {
        family: 'ArchivoVariable',
        source: 'asset:font-archivo-variable',
        mimeType: 'font/ttf',
        weight: '100 900',
        style: 'normal',
      },
    ]);
  });
});
