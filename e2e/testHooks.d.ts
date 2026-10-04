// The test hooks a debug build of the app puts on `window` (__TEST_HOOKS__):
// `blankGeometry` (exposeGeometry in src/engine/geometry.ts),
// `blankPageViewPerf` (src/engine/perf.ts), `blankBootTimes` and
// `blankBreakEngine`. Written out here, since E2E's type check can't compile
// the app's sources; keep them in step.

interface BlankBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface BlankTablePiece {
  page: number;
  box: BlankBox;
  // the first of its rows, counted in the table
  firstRow: number;
  rows: number[];
  columns: number[];
}

interface BlankGeometry {
  // the end of the content of an element of the hidden editor
  endOf: (element: Element) => number;
  caretBox: (pos: number, after?: boolean) => BlankBox | null;
  rangeRects: (from: number, to: number) => BlankBox[];
  blockBoxes: (from: number, to: number) => (BlankBox & { page: number })[];
  hitAt: (x: number, y: number) => { node: boolean; pos: number } | null;
  scrollTops: (positions: readonly number[]) => (number | null)[];
  scrollState: () => { top: number; height: number; max: number } | null;
  // each table of the document, null for one the pages don't show
  tables: () => ({ rowCount: number; pieces: BlankTablePiece[] } | null)[];
  // where the `index`th occurrence of `text` starts, or -1
  find: (text: string, index?: number) => number;
  // whether the engine is still laying out the rest of a long document
  laying: () => boolean;
}

interface Window {
  blankGeometry: BlankGeometry;
  // milliseconds from the window opening to each step of the boot
  blankBootTimes: () => Record<string, number>;
  // the timings of the page view, by kind; `clear` empties them
  blankPageViewPerf: (clear?: boolean) => Record<string, number[]>;
  // makes the engine trap, as a broken engine would
  blankBreakEngine: () => void;
}
