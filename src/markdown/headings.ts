import type { Node } from "prosemirror-model";

/**
 * headingText returns the text of a heading as the outline, the PDF's
 * bookmarks and tables of contents show it: on one line, with a space for an
 * image in it, and "" for a heading without text
 */
export const headingText = (node: Node): string =>
  node.textBetween(0, node.content.size, " ", " ").replace(/\s+/g, " ").trim();

/**
 * isListed tells whether a heading is one of the document's headings, which
 * the outline, the PDF's bookmarks and tables of contents list: one where
 * headings count (`place`, at the top of the document or in a form's field,
 * not in a quote or a list), with text
 */
export const isListed = (node: Node, place: boolean): boolean =>
  place && node.type.name === "heading" && headingText(node) !== "";

/**
 * forEachHeading calls `f` with every heading where headings count: at the
 * top of the document and at the top of a form's fields, in order, with
 * where it starts
 */
export const forEachHeading = (
  doc: Node,
  f: (heading: Node, pos: number) => void,
) => {
  const visit = (node: Node, pos: number) => {
    if (node.type.name === "heading") f(node, pos);
  };
  doc.forEach((node, pos) => {
    visit(node, pos);
    if (node.type.name !== "form_block") return;
    node.forEach((field, offset) =>
      field.forEach((child, inner) =>
        visit(child, pos + 1 + offset + 1 + inner),
      ),
    );
  });
};

export interface ListedHeading {
  // 1 … 6
  level: number;
  text: string;
  // where the heading node starts in the document
  pos: number;
}

/**
 * listedHeadings returns the headings of `doc` that are listed (see
 * isListed), in order, up to the level `depth`: what a table of contents to
 * that depth lists, its n-th entry for the n-th of them
 */
export const listedHeadings = (doc: Node, depth = 6): ListedHeading[] => {
  const found: ListedHeading[] = [];
  forEachHeading(doc, (node, pos) => {
    const level = node.attrs.level as number;
    if (isListed(node, true) && level <= depth) {
      found.push({ level, text: headingText(node), pos });
    }
  });
  return found;
};
