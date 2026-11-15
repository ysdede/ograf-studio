import { describe, expect, it } from 'vitest';
import {
  createComposition,
  createCustomActionDefinition,
  createKeyframe,
  createLayerKeyframe,
  createLayerOfKind,
  createLayerPropertyKeyframe,
  createTransition,
} from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled lifecycle contract', () => {
  it('derives lifecycle positions and projects transition/action identities for the runtime', () => {
    const start = createKeyframe({ id: 'native-start', name: 'Start', role: 'start' });
    const step = createKeyframe({ id: 'native-step', name: 'On air', role: 'step' });
    const end = createKeyframe({ id: 'native-end', name: 'End', role: 'end' });
    const composition = createComposition({
      keyframes: [start, step, end],
      transitions: [
        createTransition(start.id, step.id, { durationFrames: 11, easing: 'ease-in' }),
        createTransition(step.id, end.id, { durationFrames: 23, easing: 'ease-out' }),
      ],
      customActions: [
        createCustomActionDefinition({
          id: 'editor-action-1',
          actionId: 'take-live',
          name: 'Take live',
        }),
      ],
    });

    const descriptor = compileDescriptor(composition);

    expect(descriptor.keyframes).toEqual([
      { id: 'native-start', frame: 0, role: 'start' },
      { id: 'native-step', frame: 11, role: 'step' },
      { id: 'native-end', frame: 34, role: 'end' },
    ]);
    expect(descriptor.transitions).toEqual([
      {
        fromKeyframeId: 'native-start',
        toKeyframeId: 'native-step',
        durationFrames: 11,
        easing: 'ease-in',
      },
      {
        fromKeyframeId: 'native-step',
        toKeyframeId: 'native-end',
        durationFrames: 23,
        easing: 'ease-out',
      },
    ]);
    expect(descriptor.customActions).toEqual([
      { id: 'take-live', name: 'Take live', durationFrames: 0 },
    ]);
  });

  it('projects pose and property keys independently of lifecycle frames', () => {
    const layer = createLayerOfKind('rectangle');
    const earlyPose = createLayerKeyframe(
      3,
      {
        x: 17,
        y: 9,
        width: 240,
        height: 80,
        rotation: -4,
        opacity: 0.9,
        transformOriginX: 0.5,
        transformOriginY: 0.5,
      },
      { id: 'pose-early', easing: 'quad-in' },
    );
    const latePose = createLayerKeyframe(
      21,
      {
        x: 420,
        y: 36,
        width: 300,
        height: 100,
        rotation: 6,
        opacity: 0.7,
        transformOriginX: 0.25,
        transformOriginY: 0.75,
      },
      { id: 'pose-late', easing: 'ease-out' },
    );
    // Layer pose keys remain in authored order; property tracks are resolved and sorted.
    layer.keyframes = [latePose, earlyPose];
    const lateProperty = createLayerPropertyKeyframe(24, 640, {
      id: 'x-late',
      easing: 'linear',
      curve: { x1: 0.2, y1: 0.8, x2: 0.7, y2: 0.1 },
    });
    const earlyProperty = createLayerPropertyKeyframe(5, 33, { id: 'x-early', easing: 'quad-out' });
    layer.animationTracks.x = [lateProperty, earlyProperty];
    const start = createKeyframe({ id: 'clock-start', role: 'start' });
    const step = createKeyframe({ id: 'clock-step', role: 'step' });
    const end = createKeyframe({ id: 'clock-end', role: 'end' });
    const composition = createComposition({
      layers: [layer],
      keyframes: [start, step, end],
      transitions: [
        createTransition(start.id, step.id, { durationFrames: 12 }),
        createTransition(step.id, end.id, { durationFrames: 18 }),
      ],
    });

    const descriptor = compileDescriptor(composition);
    const compiledLayer = descriptor.layers[0]!;

    expect(compiledLayer.keyframes).toEqual([
      { id: 'pose-late', frame: 21, transform: latePose.transform, easing: 'ease-out' },
      { id: 'pose-early', frame: 3, transform: earlyPose.transform, easing: 'quad-in' },
    ]);
    expect(compiledLayer.animationTracks.x).toEqual([
      { id: 'x-early', frame: 5, value: 33, easing: 'quad-out' },
      {
        id: 'x-late',
        frame: 24,
        value: 640,
        easing: 'linear',
        curve: { x1: 0.2, y1: 0.8, x2: 0.7, y2: 0.1 },
      },
    ]);
    expect(compiledLayer.keyframes.every((key) => ![0, 12, 30].includes(key.frame))).toBe(true);
    expect(compiledLayer.animationTracks.x!.every((key) => ![0, 12, 30].includes(key.frame))).toBe(
      true,
    );
  });
});
