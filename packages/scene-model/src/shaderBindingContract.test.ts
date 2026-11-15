import { describe, expect, it } from 'vitest';
import { applyElementDataValue, applyElementDataValues, readElementDataValue } from './boundPaint';
import { createShaderElement } from './factory';
import { inspectShaderSource, shaderParameterDefinition } from './shader';

const source = `#pragma ograf amount slider min(0) max(10)
const float amount = 1.;
#pragma ograf tint color
const vec3 tint = vec3(0.01, 0.16, 0.42);
void mainImage(out vec4 c, in vec2 p) { c=vec4(tint*amount, 1.); }`;

describe('cached shader parameter contract', () => {
  it('hands out a parameter definition the caller owns', () => {
    shaderParameterDefinition(source, 'tint');
    const definition = shaderParameterDefinition(source, 'tint')!;
    (definition.defaultValue as number[])[0] = 999;
    definition.name = 'changed';
    expect(shaderParameterDefinition(source, 'tint')).toMatchObject({
      name: 'tint',
      defaultValue: [0.01, 0.16, 0.42],
    });
    expect(inspectShaderSource(source).parameters[1]).toMatchObject({
      name: 'tint',
      defaultValue: [0.01, 0.16, 0.42],
    });
    expect(shaderParameterDefinition(source, 'missing')).toBeUndefined();
  });

  it('keeps clamping, exact authored colours and read ownership', () => {
    const element = createShaderElement({ fragmentSource: source });
    expect(applyElementDataValue(element, 'parameters.amount', 20)).toMatchObject({
      parameters: { amount: 10 },
    });
    expect(applyElementDataValue(element, 'parameters.tint', '#03296b')).toMatchObject({
      parameters: { tint: [0.01, 0.16, 0.42] },
    });
    const tint = readElementDataValue(element, 'parameters.tint') as number[];
    tint[0] = 999;
    expect(readElementDataValue(element, 'parameters.tint')).toEqual([0.01, 0.16, 0.42]);
    expect(element.parameters).toEqual({});
  });

  it('keeps clamping and exact authored colours when bindings are applied together', () => {
    const element = createShaderElement({ fragmentSource: source });
    expect(
      applyElementDataValues(element, [
        ['parameters.amount', 20],
        ['parameters.tint', '#03296b'],
      ]),
    ).toMatchObject({ parameters: { amount: 10, tint: [0.01, 0.16, 0.42] } });
    expect(element.parameters).toEqual({});
  });

  describe.each([{ missing: 1 }, { tint: 'not-a-color' }])(
    'invalid sibling parameters %j',
    (parameters) => {
      const invalid = () => {
        const element = createShaderElement({ fragmentSource: source });
        element.parameters = parameters as unknown as typeof element.parameters;
        return element;
      };

      it('are rejected when a binding is applied or read', () => {
        expect(() => applyElementDataValue(invalid(), 'parameters.amount', 2)).toThrow();
        expect(() => readElementDataValue(invalid(), 'parameters.amount')).toThrow();
      });

      it('are rejected when bindings are applied together', () => {
        expect(() =>
          applyElementDataValues(invalid(), [
            ['parameters.amount', 2],
            ['parameters.amount', 3],
          ]),
        ).toThrow();
      });
    },
  );

  describe('a source with an invalid input contract', () => {
    const invalid = () => {
      const element = createShaderElement({ fragmentSource: source });
      element.fragmentSource = `${source}\nuniform float invalid;`;
      return element;
    };

    it('is rejected when a binding is applied or read', () => {
      expect(() => applyElementDataValue(invalid(), 'parameters.amount', 2)).toThrow();
      expect(() => readElementDataValue(invalid(), 'parameters.amount')).toThrow();
    });

    it('is rejected when bindings are applied together', () => {
      expect(() => applyElementDataValues(invalid(), [['parameters.amount', 2]])).toThrow();
    });
  });
});
