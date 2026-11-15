import { describe, expect, it } from 'vitest';
import {
  createComposition,
  createFieldDefinition,
  createLayerOfKind,
} from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled runtime collection contract', () => {
  it('resolves the array key, selects prototype layers, preserves collection options, and interleaves paint order', () => {
    const background = createLayerOfKind('rectangle');
    const plate = createLayerOfKind('rectangle');
    const label = createLayerOfKind('text');
    const foreground = createLayerOfKind('rectangle');
    plate.groupId = 'row-prototype';
    label.groupId = 'row-prototype';
    const field = createFieldDefinition('array', {
      id: 'array-field-id',
      key: 'rankedRows',
      items: createFieldDefinition('object', {
        key: 'row',
        properties: [createFieldDefinition('text', { key: 'label' })],
      }),
    });
    const composition = createComposition({
      layers: [background, plate, label, foreground],
      dataFields: [field],
      runtimeCollections: [
        {
          id: 'ranked-collection',
          name: 'Ranked rows',
          fieldId: field.id,
          prototypeLayerIds: [plate.id, label.id],
          offsetPerItem: { x: 8, y: 32 },
          capacity: 4,
          overflow: 'truncate',
          itemKeyPath: ['id'],
          sortPath: ['score', 'current'],
          sortDirection: 'descending',
          pageSize: 2,
          page: 1,
        },
      ],
    });

    const descriptor = compileDescriptor(composition);

    expect(descriptor.layers.map((layer) => layer.id)).toEqual([background.id, foreground.id]);
    expect(descriptor.collections).toEqual([
      {
        id: 'ranked-collection',
        name: 'Ranked rows',
        dataKey: 'rankedRows',
        prototypeGroupId: 'row-prototype',
        prototypeLayers: [
          expect.objectContaining({ id: plate.id }),
          expect.objectContaining({ id: label.id }),
        ],
        offsetPerItem: { x: 8, y: 32 },
        capacity: 4,
        overflow: 'truncate',
        itemKeyPath: ['id'],
        sortPath: ['score', 'current'],
        sortDirection: 'descending',
        pageSize: 2,
        page: 1,
      },
    ]);
    expect(descriptor.paintOrder).toEqual([
      { type: 'layer', id: background.id },
      { type: 'collection', id: 'ranked-collection' },
      { type: 'layer', id: foreground.id },
    ]);
  });

  it('rejects a collection whose array field or prototype layer is missing', () => {
    const prototype = createLayerOfKind('rectangle');
    prototype.groupId = 'prototype';
    const field = createFieldDefinition('array', { key: 'rows' });
    const composition = createComposition({
      layers: [prototype],
      dataFields: [field],
      runtimeCollections: [
        {
          id: 'rows-collection',
          name: 'Rows',
          fieldId: field.id,
          prototypeLayerIds: [prototype.id],
          offsetPerItem: { x: 0, y: 20 },
          capacity: 2,
          overflow: 'truncate',
          itemKeyPath: [],
          sortPath: [],
          sortDirection: 'none',
          pageSize: 0,
          page: 0,
        },
      ],
    });
    const missingField = structuredClone(composition);
    missingField.runtimeCollections[0]!.fieldId = 'missing-array-field';
    expect(() => compileDescriptor(missingField)).toThrow(/Runtime collection field is missing/);
    const missingPrototype = structuredClone(composition);
    missingPrototype.runtimeCollections[0]!.prototypeLayerIds = ['missing-layer'];
    expect(() => compileDescriptor(missingPrototype)).toThrow(/prototype layer is missing/);
  });
});
