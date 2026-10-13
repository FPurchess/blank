import type { Node } from "prosemirror-model";

/**
 * freeEquationIdIn returns an id for a numbered equation not in `taken`:
 * eq-1, eq-2…, as pandoc and Quarto write them ({#eq-1})
 */
export const freeEquationIdIn = (taken: ReadonlySet<string>) => {
  let number = 1;
  while (taken.has(`eq-${number}`)) number++;
  return `eq-${number}`;
};

/**
 * freeEquationId returns an id for a numbered equation that `doc` doesn't
 * have yet
 */
export const freeEquationId = (doc: Node) => {
  const taken = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === "math_display" && node.attrs.label) {
      taken.add(node.attrs.label as string);
    }
    return true;
  });
  return freeEquationIdIn(taken);
};

/**
 * unnumbered tells whether a formula gets no number of Blank's: it labels
 * itself with `\tag` (or `\tag*`), or says it has none with `\notag` or
 * `\nonumber`, as amsmath and pandoc read them. The control word itself
 * counts, not `\tagged`, nor one in a comment. The layout engine asks the
 * same (`unnumbered` in src-tauri/layout/src/engine/numbers.rs)
 */
export const unnumbered = (latex: string) => {
  for (let index = 0; index < latex.length; index++) {
    const char = latex[index];
    if (char === "%") {
      // a comment, to the end of its line
      const end = latex.indexOf("\n", index);
      if (end < 0) return false;
      index = end;
    } else if (char === "\\") {
      const word = /^[A-Za-z]*/.exec(latex.slice(index + 1))![0];
      if (word === "tag" || word === "notag" || word === "nonumber") {
        return true;
      }
      // a control symbol, e.g. \% or \\, stands for no more
      index += Math.max(word.length, 1);
    }
  }
  return false;
};
