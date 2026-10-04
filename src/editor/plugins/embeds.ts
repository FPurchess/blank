import { Fragment, type Node, Slice } from "prosemirror-model";
import { Plugin } from "prosemirror-state";

import { schema } from "../../markdown";
import { newEmbedId } from "../../markdown/blocks/embeds";

// Embeds in the editor (see src/markdown/blocks/embeds.ts): a pasted one,
// or a copy dragged on the pages (dropMoved in ../pagePointer.ts), whose id
// the document has already gets a new id, so the embeds of a
// document stay apart, e.g. in Word. Enter edits a selected one (see
// ./blockTools.ts).

/**
 * withNewIds returns `slice` with a new id for each embed whose id is one
 * of `taken`
 */
export const withNewIds = (slice: Slice, taken: Set<string>): Slice => {
  let changed = false;
  const nodes: Node[] = [];
  slice.content.forEach((node) => {
    if (
      node.type === schema.nodes.embed &&
      taken.has(node.attrs.id as string)
    ) {
      changed = true;
      nodes.push(node.type.create({ ...node.attrs, id: newEmbedId() }));
    } else nodes.push(node);
  });
  return changed
    ? new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd)
    : slice;
};

/**
 * apartFrom returns `slice` with a new id for each embed whose id `doc` has
 * already, for a paste or a copy dropped into it
 */
export const apartFrom = (slice: Slice, doc: Node): Slice => {
  const taken = new Set<string>();
  doc.forEach((node) => {
    if (node.type === schema.nodes.embed) taken.add(node.attrs.id as string);
  });
  return taken.size ? withNewIds(slice, taken) : slice;
};

/**
 * embeds keeps the ids of embeds apart, see the comment on top
 */
export const embeds = () =>
  new Plugin({
    props: {
      transformPasted: (slice, view) => apartFrom(slice, view.state.doc),
    },
  });
