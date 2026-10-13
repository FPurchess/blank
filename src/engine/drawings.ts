import type { PageEngine } from "./engine";

// Drawings a module made (diagrams, maths), handed to an engine: each kind
// keeps what it gave each engine, so an engine gets a drawing once, again
// when it's drawn anew (e.g. with a font found for its labels), and lets go
// of those its document no longer shows.

export interface DrawingCalls {
  // gives the engine the drawing `json` for `key`; false if it can't read it
  add(engine: PageEngine, key: string, json: string): boolean;
  remove(engine: PageEngine, key: string): void;
}

/**
 * createDrawingSync returns what hands one kind's drawings to an engine:
 * `shown` maps the keys its document shows to their drawings, undefined
 * for one not drawn yet
 */
export const createDrawingSync = (calls: DrawingCalls) => {
  const given = new WeakMap<PageEngine, Map<string, string>>();
  return (engine: PageEngine, shown: Map<string, string | undefined>) => {
    let had = given.get(engine);
    if (!had) given.set(engine, (had = new Map()));
    for (const [key, json] of shown) {
      if (json && had.get(key) !== json && calls.add(engine, key, json)) {
        had.set(key, json);
      }
    }
    for (const key of had.keys()) {
      if (shown.has(key)) continue;
      calls.remove(engine, key);
      had.delete(key);
    }
  };
};
