import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Node } from "prosemirror-model";

import {
  createEngine,
  loadEngineSync,
  type PageEngine,
  setPageEngine,
} from "../engine/engine";
import type { ImageSizes } from "../engine/flatten";
import { FONT_FILES } from "../engine/fonts";
import { documentFields } from "../layout/bands";
import type { Layout } from "../layout/resolve";
import {
  type PageLayoutState,
  pageView,
  pageViewport,
  type PageViewMode,
} from "../state";
import { testLayout } from "./layout";

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

// no image is loaded
export const noSizes: ImageSizes = () => undefined;

/**
 * layOutPages lays `node` out on a new engine, on `layout`
 */
export const layOutPages = (node: Node, layout: Layout = testLayout()) => {
  const engine = testEngine();
  engine.setSettings(layout, documentFields(node));
  engine.sync(node, noSizes);
  return engine;
};

// the A4 page with 2.5 cm margins of testLayout(), in points
export const TEST_PAGE = {
  width: 595.28,
  height: 841.89,
  margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
};

/**
 * laidOutState returns what the editor's plugin publishes once `engine` has
 * laid a document out on TEST_PAGE
 */
export const laidOutState = (engine: PageEngine): PageLayoutState => ({
  ...TEST_PAGE,
  margins: { ...TEST_PAGE.margins },
  pages: engine.pages(),
  bodyVersions: engine.raw.bodyVersions(),
  bandVersions: engine.raw.bandVersions(),
  bottoms: engine.raw.bottoms(),
});

/**
 * pageOf returns what a page of `engine` shows: its text and its header and
 * footer, at their current versions
 */
export const pageOf = (engine: PageEngine, page: number) => ({
  body: engine.bodyDisplay(page, engine.bodyVersions()[page]),
  bands: engine.bandDisplay(page, engine.bandVersions()[page]),
});

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
