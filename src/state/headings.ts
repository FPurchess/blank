import type { Node } from "prosemirror-model";
import { shallowRef } from "vue";

import { forEachHeading, headingText } from "../markdown/headings";

// The document's headings, in order: its heading nodes at its top and in its
// forms' fields, as the PDF's bookmarks have them, so a heading in a quote or
// a list isn't one.
// Published by the editor's headings plugin (src/editor/plugins/headings.ts)
// whenever they change, and read by the outline (src/ui/DocumentOutline.vue).
// It knows nothing about who shows them, so a table of contents can read the
// same list.

export interface Heading {
  // 1 … 6
  level: number;
  // its text, with a space for an image in it; empty while the heading is
  text: string;
  // where the heading node starts in the document
  pos: number;
}

export const headings = shallowRef<readonly Heading[]>([]);

/**
 * headingsOf returns the headings of `doc` at its top and in its forms'
 * fields, in order (see forEachHeading)
 */
export const headingsOf = (doc: Node): Heading[] => {
  const found: Heading[] = [];
  forEachHeading(doc, (node, pos) => {
    found.push({
      level: node.attrs.level as number,
      text: headingText(node),
      pos,
    });
  });
  return found;
};

const same = (a: readonly Heading[], b: readonly Heading[]) =>
  a.length === b.length &&
  a.every(
    (heading, index) =>
      heading.level === b[index].level &&
      heading.text === b[index].text &&
      heading.pos === b[index].pos,
  );

/**
 * publishHeadings sets `headings` to those of `doc`, unless they are the same,
 * so typing in a paragraph after the last heading notifies no one
 */
export const publishHeadings = (doc: Node) => {
  const next = headingsOf(doc);
  if (!same(next, headings.value)) headings.value = next;
};
