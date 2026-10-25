import { expect, it } from 'vitest';
import { authoringOperationSchema, tickerPatchSchema } from './schemas';

it.each(['auto', 'ltr', 'rtl', 'left', 'right'])(
  'routes direction %s through the shared element patch to native validation',
  (direction) => {
    expect(
      authoringOperationSchema.parse({
        type: 'update_element',
        layerId: 'target',
        patch: { direction },
      }),
    ).toMatchObject({ patch: { direction } });
  },
);

it('keeps ticker-specific travel direction strict', () => {
  expect(tickerPatchSchema.safeParse({ direction: 'rtl' }).success).toBe(false);
  expect(tickerPatchSchema.safeParse({ direction: 'left' }).success).toBe(true);
});

it('rejects directions unsupported by every element kind', () => {
  expect(
    authoringOperationSchema.safeParse({
      type: 'update_element',
      layerId: 'target',
      patch: { direction: 'diagonal' },
    }).success,
  ).toBe(false);
});
