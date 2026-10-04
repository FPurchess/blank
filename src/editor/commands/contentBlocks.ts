import type { Node, Slice } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
  Selection,
  TextSelection,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { chainCommands } from "prosemirror-commands";

import {
  createForm,
  type Definition,
  definitionKey,
  schema,
} from "../../markdown";
import { type BlockChoice, blockPicker, tocDialog } from "../../state";
import { embedTypes, type EmbedType } from "../../embeds/registry";
import { loadTemplates, type Template } from "../../templates/library";
import { editEmbed, makeEmbed } from "./embeds";

// Content blocks: blocks Blank makes besides the text, see
// src/markdown/blocks. They stand at the top of the document, never in a
// list, a quote or a table.

// a block the picker offers, with how it puts it in
interface Choice extends BlockChoice {
  insert?: (view: EditorView) => void;
}

const TOC: Choice = {
  id: "toc",
  label: "Table of contents",
  description: "The headings, with the pages they start on",
  insert: (view) => insertTopBlock(view, schema.nodes.toc.create()),
};

/**
 * templateChoice offers a form of a template, or says what is wrong with
 * its file
 */
const templateChoice = ({ id, definition }: Template): Choice =>
  typeof definition === "string"
    ? {
        id,
        label: id,
        description: `Can't be used: ${definition}`,
        disabled: true,
      }
    : {
        id,
        label: definition.name,
        description: definition.description ?? "",
        insert: (view) => {
          const def = definitionKey(definition);
          insertTopBlock(view, createForm(definition, def), {
            [def]: definition,
          });
        },
      };

/**
 * embedChoice offers an embed of a type a plugin brought
 */
const embedChoice = (type: EmbedType): Choice => ({
  id: type.type,
  label: type.name,
  description: type.description ?? "",
  insert: (view) =>
    void makeEmbed(type).then((embed) => embed && insertTopBlock(view, embed)),
});

/**
 * topBlockEnd returns where the block at the top of the document that holds
 * `pos` ends, or where the document's content ends
 */
const topBlockEnd = (doc: Node, pos: number) => {
  const $pos = doc.resolve(pos);
  const index = $pos.index(0);
  return index < doc.childCount
    ? $pos.posAtIndex(index + 1, 0)
    : doc.content.size;
};

/**
 * insertTopBlock puts `node` at the top of the document, where the cursor is:
 * in place of the empty paragraph it is in, else after the block (the
 * paragraph, list, quote or table) it is in, with the `definitions` a form
 * needs. The cursor goes on in the paragraph after it, as after a page
 * break, or into a form's first field.
 */
export const insertTopBlock = (
  view: EditorView,
  node: Node,
  definitions?: Record<string, Definition>,
) => {
  const { state } = view;
  const { $from } = state.selection;
  const block = $from.depth > 0 ? $from.node(1) : null;
  const tr = state.tr;
  let at: number;
  if (block?.type === schema.nodes.paragraph && block.content.size === 0) {
    at = $from.before(1);
    tr.replaceWith(at, $from.after(1), node);
  } else {
    at = topBlockEnd(state.doc, $from.pos);
    tr.insert(at, node);
  }
  const after = at + node.nodeSize;
  if (!tr.doc.resolve(after).nodeAfter?.isTextblock) {
    tr.insert(after, schema.nodes.paragraph.create());
  }
  if (definitions) {
    const own = tr.doc.attrs.definitions as Record<string, Definition>;
    tr.setDocAttribute("definitions", { ...own, ...definitions });
  }
  // into a form's first field, or else on below the block
  tr.setSelection(
    node.isAtom
      ? TextSelection.create(tr.doc, after + 1)
      : Selection.near(tr.doc.resolve(at + 1)),
  );
  view.dispatch(tr.scrollIntoView());
};

/**
 * chooseBlock opens the block picker, which inserts the content block the
 * user picks: a table of contents, or a form of one of the templates (see
 * src/templates/library.ts), which are read as it opens
 */
// whether the picker is about to open, while the templates are read
let opening = false;

export const chooseBlock = (): Command => (_state, dispatch, view) => {
  if (!dispatch || !view) return true;
  if (blockPicker.value || opening) return true;
  opening = true;
  void loadTemplates().then((templates) => {
    opening = false;
    const choices = [
      TOC,
      ...templates.map(templateChoice),
      ...embedTypes().map(embedChoice),
    ];
    blockPicker.value = {
      choices,
      pick: (id) => {
        choices.find((choice) => choice.id === id)?.insert?.(view);
        view.focus();
      },
      cancel: () => view.focus(),
    };
  });
  return true;
};

/**
 * editBlock edits the selected content block: a table of contents in its
 * dialog, an embed with its type, if Blank has it
 */
export const editBlock = (): Command => chainCommands(editToc(), editEmbed());

/**
 * removeTopBlock removes the content block at `pos`, the cursor going where
 * it was
 */
export const removeTopBlock = (view: EditorView, pos: number) => {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  const tr = view.state.tr.delete(pos, pos + node.nodeSize);
  const at = Math.min(pos, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(at)));
  view.dispatch(tr.scrollIntoView());
};

/**
 * pasteTopBlocks pastes a slice holding content blocks, which stand only at
 * the top of the document, after the block the selection is in, rather than
 * splitting the table, list or quote it is in. It returns whether it did.
 */
export const pasteTopBlocks = (view: EditorView, slice: Slice) => {
  const { $from } = view.state.selection;
  let holds = false;
  slice.content.forEach((node) => {
    if (node.type.isInGroup("top_block")) holds = true;
  });
  if (!holds || $from.depth <= 1) return false;
  const at = topBlockEnd(view.state.doc, $from.pos);
  view.dispatch(view.state.tr.replace(at, at, slice).scrollIntoView());
  return true;
};

/**
 * selectedToc returns the table of contents the selection is on, with its
 * position, or null
 */
export const selectedToc = (state: EditorState) => {
  const { selection } = state;
  return selection instanceof NodeSelection &&
    selection.node.type === schema.nodes.toc
    ? { node: selection.node, pos: selection.from }
    : null;
};

/**
 * editToc opens the dialog of the selected table of contents: how deep it
 * lists the headings and its title
 */
export const editToc = (): Command => (state, dispatch, view) => {
  const selected = selectedToc(state);
  if (!selected) return false;
  if (!dispatch || !view) return true;
  const { node, pos } = selected;
  // the table of contents still where the dialog opened it
  const at = (state: EditorState) =>
    state.doc.nodeAt(pos)?.type === schema.nodes.toc ? pos : null;
  tocDialog.value = {
    depth: node.attrs.depth as number,
    title: node.attrs.title as string,
    submit: (depth, title) => {
      const pos = at(view.state);
      if (pos !== null) {
        const attrs = view.state.doc.nodeAt(pos)!.attrs;
        const tr = view.state.tr.setNodeMarkup(pos, null, {
          ...attrs,
          depth,
          title,
        });
        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
      }
      view.focus();
    },
    remove: () => {
      const pos = at(view.state);
      if (pos !== null) removeTopBlock(view, pos);
      view.focus();
    },
    cancel: () => view.focus(),
  };
  return true;
};
