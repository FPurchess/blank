// Measurements of the page view: how long the engine took to follow a
// change, and how long painting took. Kept in memory for the last few
// hundred changes; the E2E measurement reads them from
// `window.blankPageViewPerf`.

export type PerfKind = "dispatch" | "layout" | "caret" | "paint";

const LIMIT = 500;
const samples: Record<PerfKind, number[]> = {
  dispatch: [],
  layout: [],
  caret: [],
  paint: [],
};

/**
 * record keeps how long something took, in milliseconds
 */
export const record = (kind: PerfKind, ms: number) => {
  const list = samples[kind];
  list.push(ms);
  if (list.length > LIMIT) list.shift();
};

/**
 * timed runs `run` and records how long it took
 */
export const timed = <T>(kind: PerfKind, run: () => T): T => {
  const start = performance.now();
  try {
    return run();
  } finally {
    record(kind, performance.now() - start);
  }
};

/**
 * perfSamples returns the samples, and clears them with `clear`
 */
export const perfSamples = (clear = false) => {
  const copy = {
    dispatch: [...samples.dispatch],
    layout: [...samples.layout],
    caret: [...samples.caret],
    paint: [...samples.paint],
  };
  if (clear) for (const list of Object.values(samples)) list.length = 0;
  return copy;
};

if (typeof window !== "undefined") {
  (
    window as unknown as { blankPageViewPerf: typeof perfSamples }
  ).blankPageViewPerf = perfSamples;
}
