import { describe, expect, it } from 'vitest';
import { addEffect, createLayerOfKind, updateEffect } from '@ograf-editor/scene-model';
import { applyLayerEffectsFilter } from './effectCompositing';

function hostFixture() {
  let allocated = 0;
  class Node {
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: Node[] = [];
    parentNode: Node | null = null;
    id = '';
    innerHTML = '';
    get firstElementChild(): Node | null {
      return this.children[0] ?? null;
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
    querySelector<T extends Element = Element>(selector: string): T | null {
      if (selector !== '[data-ograf-rendered-element]') return null;
      for (const child of this.children) {
        if (child.dataset.ografRenderedElement !== undefined) return child as unknown as T;
        const nested = child.querySelector(selector);
        if (nested) return nested as unknown as T;
      }
      return null;
    }
    clientWidth = 100;
    clientHeight = 60;
    ownerDocument = {
      createElementNS: () => {
        allocated++;
        return new Node();
      },
    };
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    appendChild(node: Node) {
      node.remove();
      this.children.push(node);
      node.parentNode = this;
    }
    remove() {
      if (this.parentNode)
        this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
      this.parentNode = null;
    }
  }
  const host = new Node();
  host.style.width = '100px';
  host.style.height = '60px';
  return {
    host,
    allocated: () => allocated,
    createNode: () => new Node(),
    addContent: () => {
      const content = new Node();
      host.appendChild(content);
      return content;
    },
    apply: (effects: ReturnType<typeof createLayerOfKind>['effects']) =>
      applyLayerEffectsFilter(host as unknown as HTMLElement, effects),
  };
}
describe('effect filter lifecycle', () => {
  it('applies CSS box-shadow on the layer host without translating it to a filter', () => {
    const fixture = hostFixture(),
      layer = createLayerOfKind('rectangle');
    const content = fixture.addContent();
    layer.effects.stack = [];
    addEffect(layer, 'box-shadow', {
      enabled: true,
      params: { offsetX: 0, offsetY: 5, blur: 18, spread: 0, color: '#000000', opacity: 0.14 },
    });
    fixture.apply(layer.effects);
    expect(content.style.boxShadow).toBe('0px 5px 18px 0px rgba(0, 0, 0, 0.14)');
    expect(fixture.host.style.boxShadow).toBe('none');
    expect(fixture.host.style.filter).toBe('none');
    expect(fixture.allocated()).toBe(0);
    updateEffect(layer, layer.effects.stack![0]!.id, { enabled: false });
    fixture.apply(layer.effects);
    expect(content.style.boxShadow).toBe('none');
  });
  it('targets the actual rendered paint node through the editor content-host wrapper', () => {
    const fixture = hostFixture(),
      layer = createLayerOfKind('rectangle');
    layer.effects.stack = [];
    addEffect(layer, 'box-shadow', { enabled: true });
    const wrapper = fixture.addContent(),
      root = fixture.createNode();
    // Model .layer-content-host > [data-ograf-rendered-element] > painted child.
    root.dataset.ografRenderedElement = 'rectangle';
    wrapper.appendChild(root);
    const paint = fixture.createNode();
    root.appendChild(paint);
    fixture.apply(layer.effects);
    expect(paint.style.boxShadow).toContain('rgba(0, 0, 0, 0.14)');
    expect(fixture.host.style.boxShadow).toBe('none');
  });
  it('allocates nothing for bypass, reuses a graph, sizes its bounds, then removes it', () => {
    const fixture = hostFixture(),
      layer = createLayerOfKind('rectangle');
    layer.effects.stack = [];
    const effect = addEffect(layer, 'blur');
    fixture.apply(layer.effects);
    expect(fixture.allocated()).toBe(0);
    expect(fixture.host.style.filter).toBe('none');
    updateEffect(layer, effect.id, { blendMode: 'screen', params: { radius: 8 } });
    fixture.apply(layer.effects);
    const svg = fixture.host.children[0]!,
      filter = svg.children[0]!;
    expect(filter.attributes.get('width')).toBe('150');
    fixture.host.style.width = '200px';
    fixture.apply(layer.effects);
    expect(filter.attributes.get('width')).toBe('250');
    expect(fixture.allocated()).toBe(2);
    updateEffect(layer, effect.id, { blendMode: 'normal' });
    fixture.apply(layer.effects);
    expect(fixture.host.style.filter).toBe('blur(8px)');
    expect(fixture.host.children).toHaveLength(0);
    updateEffect(layer, effect.id, { enabled: false });
    fixture.apply(layer.effects);
    expect(fixture.host.style.filter).toBe('none');
    expect(fixture.allocated()).toBe(2);
  });
});
