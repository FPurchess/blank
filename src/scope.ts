import { effectScope, onScopeDispose } from "vue";

/**
 * bootScope runs `setup` in a Vue effect scope. The scope collects what
 * `setup` starts: its watchers and computeds, the cleanups it registers with
 * `onScopeDispose` (listeners, timers, elements to remove), and the scopes of
 * the boots it calls, which stop with it.
 * @returns dispose, which stops all of it. Calling it again does nothing.
 */
export const bootScope = (setup: () => void) => {
  const scope = effectScope();
  scope.run(setup);
  return () => scope.stop();
};

/**
 * listenOnWindow adds `listener` to the window for `type` until the scope it's
 * called in, e.g. a boot's, stops
 */
export const listenOnWindow = <K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  capture = false,
) => {
  window.addEventListener(type, listener, capture);
  onScopeDispose(() => window.removeEventListener(type, listener, capture));
};
