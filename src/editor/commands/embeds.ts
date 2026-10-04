import { type Command, NodeSelection } from "prosemirror-state";

import {
  type EmbedResult,
  embedType,
  type EmbedType,
} from "../../embeds/registry";
import { schema } from "../../markdown";
import { checkEmbed, newEmbedId } from "../../markdown/blocks/embeds";
import { announce } from "../../state";

// Making and editing embeds through their types (src/embeds/registry.ts).

/**
 * attrsOf returns the attributes of an embed of `type` from what editing
 * it gave, keeping `id`; null if the drawing isn't one Blank keeps
 */
const attrsOf = (type: EmbedType, id: string, result: EmbedResult) =>
  checkEmbed(
    {
      type: type.type,
      id,
      ...(result.width ? { width: result.width } : {}),
      ...(result.alt ? { alt: result.alt } : {}),
    },
    result.data ? { text: result.data, lang: result.lang ?? "json" } : null,
    result.svg,
  );

/**
 * makeEmbed makes a new embed of `type`, or null when the user gave up or
 * the drawing isn't one Blank keeps
 */
export const makeEmbed = async (type: EmbedType) => {
  const result = await type.edit(null);
  if (!result) return null;
  const attrs = attrsOf(type, newEmbedId(), result);
  if (!attrs) announce(`${type.name} gave a drawing Blank can't show`);
  return attrs && schema.nodes.embed.create(attrs);
};

/**
 * editEmbed edits the selected embed with its type, if Blank has it
 */
export const editEmbed = (): Command => (state, dispatch, view) => {
  const { selection } = state;
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type !== schema.nodes.embed
  ) {
    return false;
  }
  const type = embedType(selection.node.attrs.type as string);
  if (!type) return false;
  if (!dispatch || !view) return true;
  const { node, from: pos } = selection;
  void type.edit(node.attrs.data as string).then((result) => {
    // the embed still where it was
    if (!result || view.state.doc.nodeAt(pos) !== node) return;
    const attrs = attrsOf(type, node.attrs.id as string, result);
    if (!attrs) {
      announce(`${type.name} gave a drawing Blank can't show`);
      return;
    }
    const tr = view.state.tr.setNodeMarkup(pos, null, attrs);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    view.focus();
  });
  return true;
};
