import { logError } from "../log";

// A module of the layout engine's own: a wasm that loads only when a
// document needs it (the diagram module, the maths module), so the engine
// starts as fast without it. Each is loaded once; a load that fails is
// tried again after RETRY, and one whose instance trapped is given up until
// Blank restarts, since wasm-bindgen's glue keeps the broken instance and
// can't load the module again. What goes wrong is logged by its kind only,
// never a document's text.

// how long a failed load waits before it's tried again
export const RETRY = 10_000;

export interface ModuleLoader<T> {
  // the module, loading it the first time
  module(): Promise<T>;
  // gives the module up after a trap left its instance unusable
  drop(error: unknown): void;
  // loads it with `load` from now on, e.g. a test's; null puts the real
  // loader back
  setLoader(load: (() => Promise<T>) | null): void;
}

// the kind of an error, never its message, which may quote a document
const kindOf = (error: unknown) =>
  error instanceof Error ? error.name : "error";

/**
 * createModuleLoader loads the module `name` (as the log lines call it,
 * e.g. "diagram") with `load`
 */
export const createModuleLoader = <T>(
  name: string,
  load: () => Promise<T>,
): ModuleLoader<T> => {
  let loader = load;
  let loading: Promise<T> | null = null;
  let failedAt = -Infinity;
  let broken = false;
  return {
    module() {
      if (broken || (!loading && performance.now() - failedAt < RETRY)) {
        return Promise.reject(new Error(`the ${name} module didn't load`));
      }
      loading ??= loader().catch((error: unknown) => {
        loading = null;
        failedAt = performance.now();
        logError(`the ${name} module didn't load`, kindOf(error));
        throw error;
      });
      return loading;
    },
    drop(error) {
      loading = null;
      broken = true;
      logError(`the ${name} module stopped working`, kindOf(error));
    },
    setLoader(next) {
      loader = next ?? load;
      loading = null;
      failedAt = -Infinity;
      broken = false;
    },
  };
};
