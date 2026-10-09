import { pageEngine } from "../engine/engine";
import { loadMathModule, mathDrawing, mathKey } from "./drawings";
import { loadMathFonts, wantMathFonts } from "./fonts";
import type { EngineAlign } from "../engine/types";
import { engineMissing } from "../state";
import { registerSource, type Rendered } from "../sources/registry";
import { loadTemml, mathMLNow, mathMLProblem, temmlLoaded } from "./mathml";

/*
 * Math as a kind of source (src/sources/registry.ts): display math, a
 * source block, and inline math, an inline node. The layout engine sets
 * both on the pages and in the PDF (src/engine/flatten.ts sends their
 * source); what's left here is what the editor shows while one is edited
 * (whether it can be set, and why not) and what it shows without the
 * engine (MathML).
 */

// what a formula is when it can be set: its size, in em
export interface MathSize {
  width: number;
  height: number;
  depth: number;
}

/**
 * mathError returns what's wrong with a formula as a sentence, with where
 */
export const mathError = (error: string, line: number, column: number) =>
  `${error} (line ${line}, column ${column})`;

/**
 * renderMath tells whether a formula can be set, and its size in em, as
 * the math module drew it (src/math/drawings.ts). Without the engine, where
 * the editor shows MathML, it tells whether Temml can read it.
 */
export const renderMath = (
  latex: string,
  display: boolean,
): Rendered<MathSize> => {
  if (!pageEngine || engineMissing.value) {
    const problem = mathMLProblem(latex, display);
    return problem
      ? { ok: false, error: problem }
      : { ok: true, data: { width: 0, height: 0, depth: 0 } };
  }
  const json = mathDrawing(latex, display);
  if (json === undefined) {
    return { ok: "unavailable", reason: "the math module is loading" };
  }
  const drawn = JSON.parse(json) as
    MathSize | { error: string; line: number; column: number };
  if ("error" in drawn) {
    return {
      ok: false,
      error: mathError(drawn.error, drawn.line, drawn.column),
      line: drawn.line,
      column: drawn.column,
    };
  }
  const { width, height, depth } = drawn;
  return { ok: true, data: { width, height, depth } };
};

// the MathML of the formulas met, by display and source, so a formula met
// again, or shown again, costs nothing; null where Temml can't read it
const made = new Map<string, string | null>();
const KEPT = 2000;

const madeMathML = (latex: string, display: boolean) => {
  const key = mathKey(latex, display);
  let mathml = made.get(key);
  if (mathml === undefined) {
    mathml = mathMLNow(latex, display);
    made.set(key, mathml);
    if (made.size > KEPT) made.delete(made.keys().next().value!);
  }
  return mathml;
};

// the previews waiting for their MathML, filled CHUNK at a time, each
// chunk a task of its own, so a document of a thousand formulas never holds
// up typing for long (Temml takes ~0.1 ms a formula, WebKit ~0.2 ms to lay
// its MathML out)
const waiting: (() => void)[] = [];
const CHUNK = 50;
let filling = false;

const fillWaiting = () => {
  if (filling) return;
  filling = true;
  const step = () => {
    for (const fill of waiting.splice(0, CHUNK)) fill();
    if (waiting.length) setTimeout(step);
    else filling = false;
  };
  loadTemml().then(step, () => {
    // without Temml, the sources stay
    waiting.length = 0;
    filling = false;
  });
};

/**
 * mathPreview returns what shows a formula as MathML: in the hidden editor,
 * what screen readers read, and what the editor shows without the engine.
 * It holds the source until its MathML is filled in, soon after.
 */
export const mathPreview = (latex: string, display: boolean) => {
  const element = document.createElement(display ? "div" : "span");
  element.className = "math-preview";
  element.textContent = latex;
  const fill = () => {
    const mathml = madeMathML(latex, display);
    if (mathml) element.innerHTML = mathml;
  };
  // at once while Temml is loaded and the formula was met before
  if (temmlLoaded() && made.has(mathKey(latex, display))) fill();
  else {
    waiting.push(fill);
    fillWaiting();
  }
  return element;
};

/**
 * readyMath loads what sets formulas: the math module and the KaTeX fonts.
 * Rendering waits for it, so a document opened with math (awaitSources)
 * and an export (renderAll) find them there.
 */
const readyMath = () =>
  // without the engine, Temml tells what's wrong; the module and the fonts
  // would only be waited for
  !pageEngine || engineMissing.value
    ? loadTemml().then(
        () => undefined,
        () => undefined,
      )
    : Promise.all([loadMathModule(), loadMathFonts()]).then(() => undefined);

/**
 * registerMath makes math a kind of source
 * @returns what takes it back
 */
export const registerMath = () => {
  const display = registerSource<MathSize>({
    node: "math_display",
    lang: "math",
    label: () => "Equation",
    debounce: 0,
    written: true,
    render: (source) => readyMath().then(() => renderMath(source, true)),
    // the engine sets it from its source (see src-tauri/layout/src/math.rs)
    item: (node, { pos, end, preview, top }) => {
      wantMathFonts();
      const align = top ? (node.attrs.align as EngineAlign | null) : null;
      return {
        kind: "math",
        pos,
        end,
        latex: node.textContent,
        ...(node.attrs.label ? { numbered: true } : {}),
        ...(align ? { align } : {}),
        ...(preview ? { preview } : {}),
      };
    },
    preview: (source) => mathPreview(source, true),
  });
  const inline = registerSource<MathSize>({
    node: "math_inline",
    lang: "math",
    inline: true,
    label: () => "Equation",
    debounce: 0,
    written: true,
    render: (source) => readyMath().then(() => renderMath(source, false)),
    preview: (source) => mathPreview(source, false),
  });
  return () => {
    display();
    inline();
  };
};
