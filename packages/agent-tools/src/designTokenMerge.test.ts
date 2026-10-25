import { expect, it } from 'vitest';
import { designTokenTargetPropertySchema } from './schemas';

it.each([
  'effects.shadow.blur',
  'effects.shadow.spread',
  'fill.parameters.intensity',
  'strokePaint.parameters.tint',
])('retains fork effect and upstream shader token bindings: %s', (property) => {
  expect(designTokenTargetPropertySchema.safeParse(property).success).toBe(true);
});

it.each(['effects.shadow.unknown', 'fill.parameters.', 'strokePaint.parameters.bad-name'])(
  'rejects invalid token target %s',
  (property) => expect(designTokenTargetPropertySchema.safeParse(property).success).toBe(false),
);
