// Measurements of the page view: how long the engine took to follow a
// change, and how long painting took. Kept in memory for the last few
// hundred changes; the E2E measurement reads them from
// `window.blankPageViewPerf`.

export type PerfKind =
  | "dispatch"
  | "layout"
  | "caret"
  | "paint"
  // the page view's scroll handler, its render, and moving the hidden
  // editor under the caret
  | "scroll"
  | "render"
  | "align";

const LIMIT = 500;
const samples: Record<PerfKind, number[]> = {
  dispatch: [],
  layout: [],
  caret: [],
  paint: [],
  scroll: [],
  render: [],
  align: [],
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
    scroll: [...samples.scroll],
    render: [...samples.render],
    align: [...samples.align],
  };
  if (clear) for (const list of Object.values(samples)) list.length = 0;
  return copy;
};

// when each step of the start-up was done, in ms since the window opened
const boot: Record<string, number> = {};

/**
 * bootMark notes when a step of the start-up was done, the first time
 */
export const bootMark = (step: string) => {
  boot[step] ??= Math.round(performance.now());
};

/**
 * exposePerf lets E2E tests read the measurements, through
 * `window.blankPageViewPerf` and `window.blankBootTimes`
 */
export const exposePerf = () => {
  Object.assign(window, {
    blankPageViewPerf: perfSamples,
    blankBootTimes: () => ({ ...boot }),
  });
};
