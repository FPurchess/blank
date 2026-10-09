import type { Node } from "prosemirror-model";

import { drawnMath } from "../state/drawings";
import {
  dropMathModule,
  type MathModule,
  mathModule,
} from "../engine/mathModule";

/*
 * The formulas as the math module drew them (src/engine/mathModule.ts),
 * which the engines set: what the module made of each formula, by its kind
 * and source, made once the module is there, and given to every engine
 * before it lays out what holds the formula (src/editor/plugins/pageView.ts,
 * src/engine/pdf.ts). Until the module has loaded, a formula shows its
 * source, and once it has, the pages lay the formulas out again.
 */

// what the module made of each formula, by mathKey
const drawn = new Map<string, string>();
// the most kept; past it, the oldest go, and come again when asked for
const KEPT = 5000;

let module: MathModule | null = null;
// true once the module trapped: formulas not drawn yet show their source
let givenUp = false;
// formulas asked for before the module was there
const waiting = new Map<string, [string, boolean]>();

/**
 * mathKey tells formulas apart by their kind and source
 */
export const mathKey = (latex: string, display: boolean) =>
  `${display ? "d" : "i"}${latex}`;

/**
 * mathOfKey returns the source and kind a mathKey stands for
 */
export const mathOfKey = (key: string): [string, boolean] => [
  key.slice(1),
  key.startsWith("d"),
];

// what a formula that made the module trap is, so it isn't drawn again
const TRAPPED = JSON.stringify({
  error: "Blank can't set this formula",
  line: 1,
  column: 1,
});

const make = (loaded: MathModule, latex: string, display: boolean) => {
  let json: string;
  try {
    json = loaded.draw(latex, display);
  } catch (error) {
    // the formula shows its source, and the module is given up until Blank
    // starts again: nothing is drawn with it any more
    module = null;
    givenUp = true;
    waiting.clear();
    dropMathModule(error);
    json = TRAPPED;
  }
  drawn.set(mathKey(latex, display), json);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value!);
  return json;
};

/**
 * mathDrawing returns what the module made of a formula: its drawing's
 * JSON, or what is wrong with it. Before the module is there, it returns
 * undefined and loads it; the formula is drawn then, and drawnMath bumped.
 */
export const mathDrawing = (
  latex: string,
  display: boolean,
): string | undefined => {
  const key = mathKey(latex, display);
  const known = drawn.get(key);
  if (known !== undefined) {
    // used again: the last to be forgotten
    drawn.delete(key);
    drawn.set(key, known);
    return known;
  }
  if (module) return make(module, latex, display);
  if (givenUp) return undefined;
  waiting.set(key, [latex, display]);
  void loadMathModule();
  return undefined;
};

/**
 * loadMathModule loads the module, once, and draws what was asked for
 * meanwhile; a module that doesn't load leaves the formulas their source
 */
export const loadMathModule = () =>
  mathModule().then(
    (loaded) => {
      if (module === loaded) return;
      module = loaded;
      for (const [latex, display] of waiting.values()) {
        make(loaded, latex, display);
        // it trapped: the instance isn't called again
        if (module !== loaded) break;
      }
      waiting.clear();
      drawnMath.value++;
    },
    () => {},
  );

/**
 * mathIn returns the formulas of `doc` (or of any node, itself included):
 * each source with whether it's
 * display math, once each
 */
export const mathIn = (doc: Node): [string, boolean][] => {
  const found = new Map<string, [string, boolean]>();
  const look = (node: Node) => {
    const name = node.type.name;
    if (name !== "math_inline" && name !== "math_display") return !node.isLeaf;
    const display = name === "math_display";
    found.set(mathKey(node.textContent, display), [node.textContent, display]);
    return false;
  };
  if (look(doc)) doc.descendants(look);
  return [...found.values()];
};

/**
 * drawAllMath draws every formula of `doc`, loading the module first, e.g.
 * for the PDF: the formulas with what the module made of each, those it
 * couldn't draw (it didn't load) left out
 */
export const drawAllMath = async (
  doc: Node,
): Promise<[string, boolean, string][]> => {
  const formulas = mathIn(doc);
  if (!formulas.length) return [];
  await loadMathModule();
  return formulas.flatMap(([latex, display]) => {
    const json = mathDrawing(latex, display);
    return json === undefined ? [] : [[latex, display, json]];
  });
};

/**
 * forgetMathModule forgets the module and what it drew, for the tests
 */
export const forgetMathModule = () => {
  module = null;
  givenUp = false;
  drawn.clear();
  waiting.clear();
};
