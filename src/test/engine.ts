import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createEngine,
  loadEngineSync,
  type PageEngine,
  setPageEngine,
} from "../engine/engine";
import { FONT_FILES } from "../engine/fonts";
import { pageView, pageViewport, type PageViewMode } from "../state";

const root = resolve(import.meta.dirname, "../..");
let fonts: Uint8Array[] | null = null;

/**
 * testEngine returns a layout engine with Blank's fonts, loaded from disk
 */
export const testEngine = (): PageEngine => {
  if (fonts) return createEngine(fonts);
  const wasm = readFileSync(
    resolve(root, "src/engine/wasm/blank_layout_bg.wasm"),
  );
  fonts = FONT_FILES.map((file) => readFileSync(resolve(root, "fonts", file)));
  return loadEngineSync(wasm, fonts);
};

// the window of the page view in tests: 800 × 600 at the top left
export const TEST_VIEWPORT = {
  left: 0,
  top: 0,
  width: 800,
  height: 600,
  scrollTop: 0,
};

/**
 * showPages sets up the page view as the app shows it: an engine for the
 * editor's pageSync plugin to lay out with, and the view's window.
 * `hidePages` undoes it.
 */
export const showPages = (mode: PageViewMode = "pages") => {
  const engine = testEngine();
  setPageEngine(engine);
  pageView.value = mode;
  pageViewport.value = { ...TEST_VIEWPORT };
  return engine;
};

export const hidePages = () => {
  setPageEngine(null);
  pageViewport.value = null;
  pageView.value = "page-ends";
};
