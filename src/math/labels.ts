import type { Node } from "prosemirror-model";

/**
 * freeEquationId returns an id for a numbered equation that `doc` doesn't
 * have yet: eq-1, eq-2…, as pandoc and Quarto write them ({#eq-1})
 */
export const freeEquationId = (doc: Node) => {
  const taken = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === "math_display" && node.attrs.label) {
      taken.add(node.attrs.label as string);
    }
    return true;
  });
  let number = 1;
  while (taken.has(`eq-${number}`)) number++;
  return `eq-${number}`;
};
