import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { setDiagramModuleLoader } from "../engine/diagramModule";
import { FONT_FILES } from "../engine/fonts";
import {
  DiagramModule,
  initSync,
} from "../engine/wasm/drawings/blank_drawings.js";

const root = resolve(import.meta.dirname, "../..");

/**
 * useTestDiagramModule loads the real diagram module from disk, with
 * Blank's fonts, as the app would; setDiagramModuleLoader(null) undoes it
 */
export const useTestDiagramModule = () =>
  setDiagramModuleLoader(async () => {
    initSync({
      module: readFileSync(
        resolve(root, "src/engine/wasm/drawings/blank_drawings_bg.wasm"),
      ),
    });
    const module = new DiagramModule();
    for (const file of FONT_FILES) {
      module.addFont(readFileSync(resolve(root, "fonts", file)));
    }
    return module;
  });
