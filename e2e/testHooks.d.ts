// The test hooks a debug build of the app puts on `window` (__TEST_HOOKS__):
// `blankGeometry` (exposeGeometry in src/engine/geometry.ts),
// `blankPageViewPerf` (src/engine/perf.ts), `blankBootTimes`,
// `blankBreakEngine` and `blankSetTheme` (src/state/appearance.ts), and
// `blankPrintCapture` (src/print/job.ts), which a test sets itself. Written
// out here, since E2E's type check can't compile the app's sources; keep them
// in step.

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
  // the blocks at the top of the document: their kind, start and end
  topBlocks: () => { type: string; from: number; to: number }[];
}

interface Window {
  blankGeometry: BlankGeometry;
  // milliseconds from the window opening to each step of the boot
  blankBootTimes: () => Record<string, number>;
  // the timings of the page view, by kind; `clear` empties them
  blankPageViewPerf: (clear?: boolean) => Record<string, number[]>;
  // makes the engine trap, as a broken engine would
  blankBreakEngine: () => void;
  // switches to a theme, as the settings do; the docs shots capture each
  // frame in light and dark with it
  blankSetTheme: (name: string) => void;
  // set by a test: what Print hands to the system's print dialog lands
  // here instead, since that dialog can't be automated
  blankPrintCapture?: { sent: { sheets: number; pdf: string }[] };
}
