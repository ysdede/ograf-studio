import { describe, expect, it, vi } from 'vitest';
import { subscribeNodosPins } from './nodosPins';

function electroNodePage() {
  let listener: ((values: unknown) => void) | null = null;
  const onData = vi.fn((next: (values: unknown) => void) => {
    listener = next;
  });
  const view = { nodos: { onData } } as unknown as Window;
  return { view, onData, send: (values: unknown) => listener?.(values) };
}

describe('subscribeNodosPins', () => {
  it('returns null outside an ElectroNode', () => {
    expect(subscribeNodosPins({} as Window, () => {})).toBeNull();
  });

  it('subscribes once per page and hands each subscriber the changes', () => {
    const page = electroNodePage();
    const first = vi.fn(), second = vi.fn();
    subscribeNodosPins(page.view, first);
    const stop = subscribeNodosPins(page.view, second)!;
    page.send({ Track: { fov: 40n } });
    expect(page.onData).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ Track: { fov: 40 } });
    expect(second).toHaveBeenCalledWith({ Track: { fov: 40 } });
    stop();
    page.send({ Track: { fov: 41 } });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it('starts a late subscriber with the values received so far, as copies', () => {
    const page = electroNodePage();
    subscribeNodosPins(page.view, () => {});
    const reused = { fov: 40 };
    page.send({ Track: reused, URL: 'page.html' });
    reused.fov = 99;
    const late = vi.fn();
    subscribeNodosPins(page.view, late);
    expect(late).toHaveBeenCalledWith({ Track: { fov: 40 }, URL: 'page.html' });
  });

  it('drops values that are not JSON data and keeps the rest', () => {
    const page = electroNodePage();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const subscriber = vi.fn();
    subscribeNodosPins(page.view, subscriber);
    page.send({ Bad: Number.NaN, Big: 2n ** 60n, Good: [1, 'a', true, null] });
    expect(subscriber).toHaveBeenCalledWith({ Good: [1, 'a', true, null] });
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
