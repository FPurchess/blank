// Captured at import time, so flushing keeps working while a test has fake
// timers installed.
const realSetTimeout = globalThis.setTimeout;

/**
 * flushPromises waits until all pending promise callbacks have run.
 * Commands start their async work without awaiting it; use this to assert
 * that something did *not* happen. For positive assertions prefer `vi.waitFor`.
 */
export const flushPromises = () =>
  new Promise<void>((resolve) => realSetTimeout(resolve, 0));

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/**
 * deferred returns a promise together with its resolve function
 * (`Promise.withResolvers` is not available on Node 18).
 */
export const deferred = <T = void>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
