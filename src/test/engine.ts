import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEngineSync, type PageEngine } from "../engine/engine";
import { FONT_FILES } from "../engine/fonts";

const root = resolve(import.meta.dirname, "../..");
let wasm: Uint8Array | null = null;
let fonts: Uint8Array[] | null = null;

/**
 * testEngine returns a layout engine with Blank's fonts, loaded from disk
 */
export const testEngine = (): PageEngine => {
  wasm ??= readFileSync(resolve(root, "src/engine/wasm/blank_layout_bg.wasm"));
  fonts ??= FONT_FILES.map((file) =>
    readFileSync(resolve(root, "fonts", file)),
  );
  return loadEngineSync(wasm, fonts);
};
