import { describe, expect, it } from 'vitest';
import { createTextElement } from './factory';
import { createShaderPaint } from './shader';
import { applyElementDataValue, applyElementDataValues } from './boundPaint';
import type { Element } from './types';

describe('applyElementDataValue text properties', () => {
  it('keeps numeric text properties numeric', () => {
    const element = createTextElement();

    expect(applyElementDataValue(element, 'fontSize', '72')).toHaveProperty('fontSize', 72);
    expect(applyElementDataValue(element, 'fontWeight', 700)).toHaveProperty('fontWeight', 700);
    expect(applyElementDataValue(element, 'lineHeight', '1.2')).toHaveProperty('lineHeight', 1.2);
    expect(applyElementDataValue(element, 'letterSpacing', '-2')).toHaveProperty(
      'letterSpacing',
      -2,
    );
    expect(applyElementDataValue(element, 'fontSize', 'not-a-number')).toHaveProperty(
      'fontSize',
      element.fontSize,
    );
  });
});

describe('applyElementDataValues', () => {
  const source = `#pragma ograf yaw slider min(-2) max(2) step(0.1)
const float yaw = 0.25;
#pragma ograf count slider min(1) max(10) step(1)
const int count = 2;
#pragma ograf tint color
const vec4 tint = vec4(0.2,0.3,0.4,0.5);
void mainImage(out vec4 c,in vec2 p) { c=tint+vec4(yaw+float(count)); }`;
  const entries: [string, unknown][] = [
    ['fill.parameters.yaw', 1.5],
    ['fill.parameters.tint', '#ff8000'],
    ['fontSize', '48'],
    ['fill.parameters.count', 7],
    ['strokePaint.parameters.yaw', -1],
    ['fill.parameters.yaw', 0.5],
  ];

  it('matches applying each bound value in turn', () => {
    const element = createTextElement({
      fill: createShaderPaint({ fragmentSource: source }),
      strokePaint: createShaderPaint({ fragmentSource: source }),
    });
    const sequential = entries.reduce<Element>(
      (current, [property, value]) => applyElementDataValue(current, property, value),
      element,
    );
    expect(applyElementDataValues(element, entries)).toEqual(sequential);
  });

  it('keeps the error for an unknown parameter', () => {
    const element = createTextElement({ fill: createShaderPaint({ fragmentSource: source }) });
    expect(() => applyElementDataValues(element, [['fill.parameters.missing', 1]])).toThrow(
      'Unknown shader parameter "missing".',
    );
  });
});
