/**
 * Data pins of the Nodos ElectroNode that hosts the page, for graphics whose host page does not forward them (a playout
 * server's renderer, such as Reality Hub's). ElectroNode hands pin values to the page through `window.nodos.onData`;
 * Studio's own Nodos page forwards them itself and plays its graphic as `NODOS_PAGE_GRAPHIC_TAG`.
 */

export type NodosPinValues = Record<string, unknown>;
type Subscriber = (values: NodosPinValues) => void;
interface NodosHost {
  onData(listener: (values: unknown) => void): unknown;
}
interface PinHub {
  subscribers: Set<Subscriber>;
  latest: NodosPinValues;
}

/** The element name Studio's Nodos page gives its graphic; that page forwards pins itself. */
export const NODOS_PAGE_GRAPHIC_TAG = 'ograf-nodos-graphic';

// One subscription per page, shared by every graphic and every copy of this runtime in it: ElectroNode may keep a
// single listener, and graphics come and go (cue, take, out) while the node keeps its pins.
const HUB_KEY = Symbol.for('ograf.runtime.nodosPins');

/** Pin values as plain JSON data: hosts may reuse their objects, and 64-bit integers arrive as bigint. */
function snapshot(value: unknown, depth = 0): unknown {
  if (typeof value === 'bigint') {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('A Nodos 64-bit integer exceeds the safe JSON range.');
    return number;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Nodos values must be finite numbers.');
    return value;
  }
  if (!value || typeof value !== 'object' || depth > 32)
    throw new Error('Nodos values must be JSON data.');
  if (Array.isArray(value)) return value.map((item) => snapshot(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, snapshot(item, depth + 1)]),
  );
}

/**
 * Calls `subscriber` with each pin change of the hosting ElectroNode, starting with the values received so far. Returns
 * the unsubscribe function, or null when the page is not in an ElectroNode.
 */
export function subscribeNodosPins(view: Window, subscriber: Subscriber): (() => void) | null {
  const scope = view as unknown as { nodos?: NodosHost; [HUB_KEY]?: PinHub };
  if (typeof scope.nodos?.onData !== 'function') return null;
  let hub = scope[HUB_KEY];
  if (!hub) {
    const created: PinHub = { subscribers: new Set(), latest: {} };
    hub = scope[HUB_KEY] = created;
    scope.nodos.onData((values) => {
      if (!values || typeof values !== 'object' || Array.isArray(values)) return;
      const changed: NodosPinValues = {};
      for (const [key, value] of Object.entries(values)) {
        try {
          changed[key] = snapshot(value);
        } catch (error) {
          console.error(`Nodos pin "${key}":`, error);
        }
      }
      Object.assign(created.latest, changed);
      for (const listener of created.subscribers) listener(changed);
    });
  }
  hub.subscribers.add(subscriber);
  if (Object.keys(hub.latest).length) subscriber({ ...hub.latest });
  const subscribers = hub.subscribers;
  return () => subscribers.delete(subscriber);
}
