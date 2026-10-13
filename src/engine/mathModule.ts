import { createModuleLoader } from "./moduleLoader";

// The math module (src-tauri/math): a wasm of its own, which lays a
// formula's LaTeX out with RaTeX as a drawing of glyphs and paths that the
// layout engine sets in the KaTeX fonts (see src-tauri/layout/src/math.rs).
// It loads only with the first formula, so documents without math never
// fetch it, and the engine starts as fast as without math. It reads no
// fonts: RaTeX's metrics are built in.

export interface MathModule {
  // a formula as a drawing's JSON, or what is wrong with it
  // (`{error, line, column}`)
  draw(latex: string, display: boolean): string;
}

/**
 * loadModule fetches and starts the module
 */
const loadModule = async (): Promise<MathModule> => {
  const glue = await import("./wasm/math/blank_math.js");
  const { default: url } = await import("./wasm/math/blank_math_bg.wasm?url");
  await glue.default({ module_or_path: url });
  return { draw: glue.draw };
};

const loader = createModuleLoader("math", loadModule);

/**
 * mathModule returns the math module, loading it the first time
 */
export const mathModule = loader.module;

/**
 * dropMathModule gives up the module after a trap left its instance
 * unusable, until Blank restarts
 */
export const dropMathModule = loader.drop;

/**
 * setMathModuleLoader loads the module with `load` from now on, e.g. a
 * test's; null puts the real loader back
 */
export const setMathModuleLoader = loader.setLoader;
