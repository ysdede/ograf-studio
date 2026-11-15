import { describe, expect, it } from 'vitest';
import { createAsset, createComposition } from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled graphic descriptor contract', () => {
  it('projects composition settings and asset dependencies with empty optional collections', () => {
    const font = createAsset({
      id: 'brand-font',
      name: 'Northstar.woff2',
      kind: 'font',
      mimeType: 'font/woff2',
      dataUri: 'data:font/woff2;base64,AA==',
      fontFamily: 'Northstar Sans',
      fontWeight: '600',
      fontStyle: 'italic',
      licenseText: 'Font license text',
      licenseName: 'Northstar Font License',
    });
    const composition = createComposition({
      width: 1440,
      height: 900,
      backgroundColor: '#101820',
      frameRate: 30,
      updateTransitionFrames: 9,
      // Exercise the compiler's documented queue fallback for old/missing input data.
      updateInterruption: undefined as never,
      assets: [font],
    });

    const descriptor = compileDescriptor(composition);

    expect({
      width: descriptor.width,
      height: descriptor.height,
      backgroundColor: descriptor.backgroundColor,
      frameRate: descriptor.frameRate,
      updateTransitionFrames: descriptor.updateTransitionFrames,
      updateInterruption: descriptor.updateInterruption,
      fonts: descriptor.fonts,
      mediaCues: descriptor.mediaCues,
      layers: descriptor.layers,
      collections: descriptor.collections,
      paintOrder: descriptor.paintOrder,
    }).toEqual({
      width: 1440,
      height: 900,
      backgroundColor: '#101820',
      frameRate: 30,
      updateTransitionFrames: 9,
      updateInterruption: 'queue',
      fonts: [
        {
          family: 'Northstar Sans',
          source: 'asset:brand-font',
          mimeType: 'font/woff2',
          weight: '600',
          style: 'italic',
        },
      ],
      mediaCues: [],
      layers: [],
      collections: [],
      paintOrder: [],
    });
    // Studio 0.30 dropped the compiled font license association; the native asset keeps its license text.
    expect(descriptor.fonts?.[0]).not.toHaveProperty('licenseSource');
    expect(descriptor.fonts?.[0]).not.toHaveProperty('licenseName');

    expect(descriptor.keyframes.map(({ id, frame, role }) => ({ id, frame, role }))).toEqual(
      composition.keyframes.map((keyframe, index) => ({
        id: keyframe.id,
        frame: index === 0 ? 0 : index * 12,
        role: keyframe.role,
      })),
    );
    expect(
      descriptor.transitions.map(({ fromKeyframeId, toKeyframeId, durationFrames }) => ({
        fromKeyframeId,
        toKeyframeId,
        durationFrames,
      })),
    ).toEqual(
      composition.transitions.map(({ fromKeyframeId, toKeyframeId, durationFrames }) => ({
        fromKeyframeId,
        toKeyframeId,
        durationFrames,
      })),
    );
    expect({
      stepKeyframeIds: descriptor.stepKeyframeIds,
      stepCount: descriptor.stepCount,
      startKeyframeId: descriptor.startKeyframeId,
      endKeyframeId: descriptor.endKeyframeId,
      customActions: descriptor.customActions,
    }).toEqual({
      stepKeyframeIds: [composition.keyframes[1]!.id],
      stepCount: 1,
      startKeyframeId: composition.keyframes[0]!.id,
      endKeyframeId: composition.keyframes[2]!.id,
      customActions: [],
    });
  });
});
