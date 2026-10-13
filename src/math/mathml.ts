import type temmlType from "temml";

/*
 * MathML for a formula's LaTeX, made by Temml, which is loaded when first
 * needed: what screen readers read in the hidden editor, what the editor
 * shows without the engine (WebKit renders MathML), and what the Word export
 * turns into Word's equations (./omml.ts). The pages and the PDF are set by
 * the layout engine instead (src-tauri/layout/src/math.rs).
 */

let temml: typeof temmlType | null = null;
let loading: Promise<typeof temmlType> | null = null;

/**
 * loadTemml loads Temml, once
 */
export const loadTemml = () => {
  loading ??= import("temml").then(
    (module) => {
      temml = module.default;
      return temml;
    },
    (error: unknown) => {
      // tried again when next needed
      loading = null;
      throw error;
    },
  );
  return loading;
};

/**
 * mathMLNow returns the MathML of a formula, or null while Temml isn't
 * loaded or if Temml can't read it
 */
export const mathMLNow = (
  latex: string,
  display: boolean,
  // the LaTeX as an annotation, which screen readers can offer
  annotate = true,
): string | null => {
  if (!temml) return null;
  try {
    return temml.renderToString(latex, {
      displayMode: display,
      throwOnError: true,
      xml: true,
      annotate,
    });
  } catch {
    return null;
  }
};

/**
 * mathML returns the MathML of a formula once Temml is loaded, or null if
 * Temml can't read it
 */
export const mathML = async (
  latex: string,
  display: boolean,
  annotate = true,
) => {
  await loadTemml();
  return mathMLNow(latex, display, annotate);
};

/**
 * temmlLoaded tells whether Temml is loaded, so mathMLNow's null means it
 * can't read the formula
 */
export const temmlLoaded = () => temml !== null;

/**
 * mathMLProblem returns why Temml can't read a formula, or null if it can
 * or isn't loaded yet: what the editor says without the engine
 */
export const mathMLProblem = (
  latex: string,
  display: boolean,
): string | null => {
  if (!temml) return null;
  try {
    temml.renderToString(latex, { displayMode: display, throwOnError: true });
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message.replace(/^Temml parse error: /, "")
      : "Blank can't read this formula";
  }
};
