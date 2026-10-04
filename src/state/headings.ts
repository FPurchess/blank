import type { Node } from "prosemirror-model";
import { shallowRef } from "vue";

import { type ListedHeading, listedHeadings } from "../markdown/headings";

// The document's headings, in order: the ones a table of contents lists, the
// PDF's bookmarks have and the outline shows (listedHeadings): at its top and
// in its forms' fields, with text, so neither a heading in a quote or a list
// nor an empty one is one.
// Published by the editor's headings plugin (src/editor/plugins/headings.ts)
// whenever they change, and read by the outline (src/ui/DocumentOutline.vue)
// and the status bar.

export type Heading = ListedHeading;

export const headings = shallowRef<readonly Heading[]>([]);

/**
 * headingsOf returns the headings of `doc` (see listedHeadings), in order
 */
export const headingsOf = (doc: Node): Heading[] => listedHeadings(doc);

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
