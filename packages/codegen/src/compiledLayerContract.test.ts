import { describe, expect, it } from 'vitest';
import { createComposition, createLayerOfKind } from '@ograf-editor/scene-model';
import { compileDescriptor } from './compileDescriptor';

describe('compiled layer contract', () => {
  it('retains runtime relations and defaults while removing ordinary authoring parents', () => {
    const ordinaryParent = createLayerOfKind('rectangle');
    const ordinaryChild = createLayerOfKind('text');
    ordinaryChild.parentId = ordinaryParent.id;

    const clippingParent = createLayerOfKind('rectangle');
    clippingParent.clipChildren = true;
    const clippedChild = createLayerOfKind('rectangle');
    clippedChild.parentId = clippingParent.id;
    clippedChild.isMaskOnly = true;
    clippedChild.mask = { sourceLayerId: clippingParent.id, mode: 'alpha', inverted: true };

    const flowParent = createLayerOfKind('rectangle');
    flowParent.autoLayout = {
      ...flowParent.autoLayout,
      direction: 'horizontal',
      gap: 2.6,
      paddingLeft: 3.4,
    };
    const flowChild = createLayerOfKind('rectangle');
    flowChild.parentId = flowParent.id;
    const noFlowParent = createLayerOfKind('rectangle');
    const noFlowChild = createLayerOfKind('rectangle');
    noFlowChild.parentId = noFlowParent.id;

    const pathSource = createLayerOfKind('path');
    const pathTarget = createLayerOfKind('rectangle');
    pathTarget.motionPath = {
      sourceLayerId: pathSource.id,
      progress: 0.4,
      orientToPath: true,
      offsetX: 2,
      offsetY: -3,
    };
    const orphanPathTarget = createLayerOfKind('rectangle');
    orphanPathTarget.motionPath = {
      sourceLayerId: 'removed-path',
      progress: 0.8,
      orientToPath: false,
      offsetX: 0,
      offsetY: 0,
    };

    const guide = createLayerOfKind('rectangle');
    guide.isGuide = true;
    const composition = createComposition({
      layers: [
        ordinaryParent,
        ordinaryChild,
        clippingParent,
        clippedChild,
        flowParent,
        flowChild,
        noFlowParent,
        noFlowChild,
        pathSource,
        pathTarget,
        orphanPathTarget,
        guide,
      ],
    });
    // Exercise the compiler's documented compatibility fallback for absent authored value.
    (ordinaryChild as unknown as { updateTransition?: undefined }).updateTransition = undefined;

    const descriptor = compileDescriptor(composition);
    const byId = new Map(descriptor.layers.map((layer) => [layer.id, layer]));

    expect(descriptor.layers.map((layer) => layer.id)).not.toContain(guide.id);
    expect(byId.get(ordinaryChild.id)).toMatchObject({
      id: ordinaryChild.id,
      isVisible: true,
      clipParentId: null,
      layoutParentId: null,
      updateTransition: { style: 'inherit', durationFrames: 0, distance: 24 },
    });
    expect(byId.get(ordinaryChild.id)).not.toHaveProperty('parentId');
    expect(byId.get(ordinaryChild.id)).not.toHaveProperty('binding');
    expect(byId.get(ordinaryChild.id)).not.toHaveProperty('collectionItem');
    expect(byId.get(ordinaryChild.id)?.loop).toBeNull();
    expect(byId.get(ordinaryChild.id)?.mask).toBeNull();
    expect(byId.get(ordinaryChild.id)?.isMaskOnly).toBe(false);
    expect(byId.get(clippedChild.id)).toMatchObject({
      clipParentId: clippingParent.id,
      layoutParentId: null,
      isMaskOnly: true,
      mask: { sourceLayerId: clippingParent.id, mode: 'alpha', inverted: true },
    });
    expect(byId.get(flowParent.id)?.autoLayout).toMatchObject({
      direction: 'horizontal',
      gap: 3,
      paddingLeft: 3,
    });
    expect(byId.get(flowChild.id)?.layoutParentId).toBe(flowParent.id);
    expect(byId.get(noFlowChild.id)?.layoutParentId).toBeNull();
    expect(byId.get(pathTarget.id)?.motionPath).toEqual(pathTarget.motionPath);
    expect(byId.get(orphanPathTarget.id)?.motionPath).toBeNull();
  });
});
