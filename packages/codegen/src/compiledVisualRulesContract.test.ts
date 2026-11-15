import { describe, expect, it } from 'vitest';
import {
  createComposition,
  createFieldDefinition,
  createLayerOfKind,
  createLayerVisualRule,
} from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled visual-rule contract', () => {
  it('resolves condition field IDs, preserves rule semantics, and prunes unresolved inputs', () => {
    const status = createFieldDefinition('text', { id: 'field-status', key: 'status' });
    const home = createFieldDefinition('integer', { id: 'field-home', key: 'homeScore' });
    const away = createFieldDefinition('integer', { id: 'field-away', key: 'awayScore' });
    const owner = createLayerOfKind('rectangle');
    const target = createLayerOfKind('rectangle');
    const guide = createLayerOfKind('rectangle');
    guide.isGuide = true;
    owner.visualRules = [
      createLayerVisualRule({
        id: 'score-rule',
        name: 'Score threshold',
        enabled: false,
        trigger: 'data',
        fieldId: status.id,
        sourcePath: ['payload', 'phase'],
        operator: 'one-of',
        value: ['LIVE', 'FINAL'],
        ignoreCase: true,
        conditions: [
          {
            fieldId: home.id,
            sourcePath: ['score', 'home'],
            operator: 'greater-than',
            compareFieldId: away.id,
            compareSourcePath: ['score', 'away'],
          },
          {
            fieldId: status.id,
            sourcePath: ['payload', 'phase'],
            operator: 'equals',
            value: { expected: 'LIVE' },
          },
          {
            fieldId: 'removed-condition-field',
            sourcePath: [],
            operator: 'empty',
          },
        ],
        match: 'any',
        actions: [
          { type: 'property', targetLayerId: target.id, targetProperty: 'opacity', value: 0.6 },
          { type: 'visibility', targetLayerId: guide.id, visible: false },
        ],
      }),
      createLayerVisualRule({
        id: 'step-event',
        name: 'Step event',
        enabled: true,
        trigger: 'step',
        eventId: 'step-2',
        delayFrames: 6,
        conditions: [{ fieldId: 'removed-event-field', sourcePath: [], operator: 'empty' }],
        actions: [{ type: 'visibility', visible: false }],
      }),
      createLayerVisualRule({
        id: 'removed-data-rule',
        fieldId: 'removed-primary-field',
        operator: 'equals',
        value: 'x',
        actions: [{ type: 'visibility', visible: true }],
      }),
      createLayerVisualRule({
        id: 'guide-only-action',
        fieldId: status.id,
        operator: 'equals',
        value: 'x',
        actions: [{ type: 'visibility', targetLayerId: guide.id, visible: true }],
      }),
    ];

    const descriptor = compileDescriptor(
      createComposition({
        layers: [owner, target, guide],
        dataFields: [status, home, away],
      }),
    );

    expect(descriptor.layers[0]!.visualRules).toEqual([
      {
        id: 'score-rule',
        name: 'Score threshold',
        enabled: false,
        trigger: 'data',
        dataKey: 'status',
        sourcePath: ['payload', 'phase'],
        operator: 'one-of',
        value: ['LIVE', 'FINAL'],
        ignoreCase: true,
        conditions: [
          {
            dataKey: 'homeScore',
            sourcePath: ['score', 'home'],
            operator: 'greater-than',
            compareDataKey: 'awayScore',
            compareSourcePath: ['score', 'away'],
          },
          {
            dataKey: 'status',
            sourcePath: ['payload', 'phase'],
            operator: 'equals',
            value: { expected: 'LIVE' },
          },
        ],
        match: 'any',
        actions: [
          { type: 'property', targetLayerId: target.id, targetProperty: 'opacity', value: 0.6 },
        ],
      },
      {
        id: 'step-event',
        name: 'Step event',
        enabled: true,
        trigger: 'step',
        dataKey: '',
        sourcePath: [],
        operator: 'equals',
        eventId: 'step-2',
        delayFrames: 6,
        actions: [{ type: 'visibility', visible: false }],
      },
    ]);
    expect(descriptor.layers.map((layer) => layer.id)).toEqual([owner.id, target.id]);
  });
});
