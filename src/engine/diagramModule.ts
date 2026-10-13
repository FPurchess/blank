import { watch } from "vue";

import { baseFonts } from "./engine";
import { fallbackFonts } from "./fallback";
import { createModuleLoader } from "./moduleLoader";

// The diagram module (src-tauri/drawings): a wasm of its own, which turns a
// diagram's SVG into a drawing of paths and glyphs the layout engine draws
// (see src-tauri/layout/src/drawing.rs). It loads only with the first
// diagram, so documents without one never fetch it, and the engine starts as
// fast as without diagrams. It sets text in the engine's own font files, in
// the engine's order, fallbacks included, so a glyph's font is the engine's
// font of the same index.

export interface DiagramModule {
  addFont(bytes: Uint8Array): void;
  // a diagram's SVG as a drawing's JSON; undefined for one it can't read
  draw(svg: string): string | undefined;
  // the characters of the last drawing's labels none of its fonts has
  missing(): string;
}

/**
 * loadModule fetches and starts the module, with the engine's fonts, and
 * the fallback fonts as they come
 */
const loadModule = async (): Promise<DiagramModule> => {
  const glue = await import("./wasm/drawings/blank_drawings.js");
  const { default: url } =
    await import("./wasm/drawings/blank_drawings_bg.wasm?url");
  await glue.default({ module_or_path: url });
  const module = new glue.DiagramModule();
  for (const font of await baseFonts()) module.addFont(font);
  // the fallbacks in the engine's order, and those found later after them
  let added = 0;
  const addFallbacks = () => {
    for (const font of fallbackFonts.value.slice(added)) {
      module.addFont(font.bytes);
    }
    added = fallbackFonts.value.length;
  };
  addFallbacks();
  watch(fallbackFonts, addFallbacks, { flush: "sync" });
  return module;
};

const loader = createModuleLoader("diagram", loadModule);

/**
 * diagramModule returns the diagram module, loading it the first time
 */
export const diagramModule = loader.module;

/**
 * dropDiagramModule gives up the module after a trap left its instance
 * unusable, until Blank restarts
 */
export const dropDiagramModule = loader.drop;

/**
 * setDiagramModuleLoader loads the module with `load` from now on, e.g. a
 * test's; null puts the real loader back
 */
export const setDiagramModuleLoader = loader.setLoader;
