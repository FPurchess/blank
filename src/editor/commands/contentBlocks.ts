import type { Node, Slice } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
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
import {
  announce,
  type BlockChoice,
  blockChoices,
  blocksPaneFocused,
  blocksPaneOpen,
  focusBlocksSearch,
  tocPopover,
} from "../../state";
import { blockName, isContentBlock } from "../../markdown/blocks/names";
import { topBlockAt } from "../../markdown/topBlock";
import { embedTypes, type EmbedType } from "../../embeds/registry";
import { type Form, loadForms } from "../../forms/library";
import { boxOnCaretPage } from "../plugins/followLayout";
import { editEmbed, makeEmbed } from "./embeds";

// Content blocks: blocks Blank makes besides the text, see
// src/markdown/blocks. They stand at the top of the document, never in a
// list, a quote or a table.

// a block the pane offers, with how it puts it in: where the cursor is, or
// at `at`, a place between two blocks at the top of the document
interface Choice extends BlockChoice {
  insert?: (view: EditorView, at?: number) => void;
}

const TOC: Choice = {
  id: "toc",
  group: "contents",
  label: "Table of contents",
  description: "The headings, with the pages they start on",
  insert: (view, at) =>
    insertTopBlock(view, schema.nodes.toc.create(), undefined, at),
};

/**
 * formChoice offers a form, or says what is wrong with its file
 */
const formChoice = ({ id, definition }: Form): Choice =>
  typeof definition === "string"
    ? {
        id,
        group: "forms",
        label: id.replace(/^user\//, ""),
        description: `Can't be used: ${definition}`,
        disabled: true,
      }
    : {
        id,
        group: "forms",
        label: definition.name,
        description: definition.description ?? "",
        definition,
        insert: (view, at) => {
          const def = definitionKey(definition);
          insertTopBlock(
            view,
            createForm(definition, def),
            { [def]: definition },
            at,
          );
        },
      };

/**
 * embedChoice offers an embed of a type a plugin brought
 */
const embedChoice = (type: EmbedType): Choice => ({
  id: type.type,
  group: "drawings",
  label: type.name,
  description: type.description ?? "",
  insert: (view, at) => {
    // the document may change while the type's editor is open
    const start = view.state.doc;
    void makeEmbed(type).then((embed) => {
      if (!embed) return;
      const { doc } = view.state;
      const still = at !== undefined && doc.eq(start) ? at : undefined;
      insertTopBlock(view, embed, undefined, still);
    });
  },
});

/**
 * topBlockEnd returns where the block at the top of the document that holds
 * `pos` ends, or where the document's content ends
 */
const topBlockEnd = (doc: Node, pos: number) =>
  topBlockAt(doc, pos)?.to ?? doc.content.size;

/**
 * insertTopBlock puts `node` at the top of the document: at `at`, a place
 * between two blocks there, or else where the cursor is, in place of the
 * empty paragraph it is in, or after the block (the paragraph, list, quote
 * or table) it is in, with the `definitions` a form needs. The new block is
 * selected, and said to be there.
 */
export const insertTopBlock = (
  view: EditorView,
  node: Node,
  definitions?: Record<string, Definition>,
  at?: number,
) => {
  const { state } = view;
  const { $from } = state.selection;
  const block = $from.depth > 0 ? $from.node(1) : null;
  const tr = state.tr;
  let pos: number;
  if (at !== undefined) {
    pos = at;
    tr.insert(pos, node);
  } else if (
    block?.type === schema.nodes.paragraph &&
    block.content.size === 0
  ) {
    pos = $from.before(1);
    tr.replaceWith(pos, $from.after(1), node);
  } else {
    pos = topBlockEnd(state.doc, $from.pos);
    tr.insert(pos, node);
  }
  const after = pos + node.nodeSize;
  if (!tr.doc.resolve(after).nodeAfter?.isTextblock) {
    tr.insert(after, schema.nodes.paragraph.create());
  }
  if (definitions) {
    const own = tr.doc.attrs.definitions as Record<string, Definition>;
    tr.setDocAttribute("definitions", { ...own, ...definitions });
  }
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  view.dispatch(tr.scrollIntoView());
  announce(`${blockName(view.state.doc, node)} inserted`);
};

// whether the blocks are being read
let reading: Promise<void> | null = null;
// the blocks the pane offers, by id
let offered = new Map<string, Choice>();

/**
 * readBlocks reads the blocks the pane offers again, the forms (see
 * src/forms/library.ts) among them, so a form just written shows up
 */
export const readBlocks = () =>
  (reading ??= loadForms()
    .then((forms) => {
      const choices = [
        TOC,
        ...forms.map(formChoice),
        ...embedTypes().map(embedChoice),
      ];
      offered = new Map(choices.map((choice) => [choice.id, choice]));
      blockChoices.value = choices.map(
        ({ id, group, label, description, disabled, definition }) => ({
          id,
          group,
          label,
          description,
          disabled,
          definition,
        }),
      );
    })
    .finally(() => {
      reading = null;
    }));

/**
 * hideBlocksPane closes the blocks pane, and gives the editor the focus
 */
export const hideBlocksPane = (view: EditorView) => {
  blocksPaneOpen.value = false;
  blocksPaneFocused.value = false;
  view.focus();
};

/**
 * toggleBlocksPane shows the blocks pane with the focus in its search, or
 * hides it while it has the focus
 */
export const toggleBlocksPane = (): Command => (_state, dispatch, view) => {
  if (!dispatch || !view) return true;
  if (blocksPaneOpen.value && blocksPaneFocused.value) {
    hideBlocksPane(view);
    return true;
  }
  blocksPaneOpen.value = true;
  focusBlocksSearch();
  void readBlocks();
  return true;
};

/**
 * toggleBlocks shows the blocks pane with the focus in its search, or hides
 * it, wherever the focus is, e.g. for its button or the main menu
 */
export const toggleBlocks = (): Command => (state, dispatch, view) => {
  if (dispatch && view && blocksPaneOpen.value) {
    hideBlocksPane(view);
    return true;
  }
  return toggleBlocksPane()(state, dispatch, view);
};

/**
 * refreshBlocks reads the blocks the pane offers again
 */
export const refreshBlocks = (): Command => (_state, dispatch) => {
  if (dispatch) void readBlocks();
  return true;
};

/**
 * insertBlock inserts the block the pane offers as `id`: where the cursor
 * is, or at `at`, a place between two blocks at the top of the document
 */
export const insertBlock =
  (id: string, at?: number): Command =>
  (_state, dispatch, view) => {
    const choice = offered.get(id);
    if (!choice?.insert) return false;
    if (dispatch && view) choice.insert(view, at);
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
    if (isContentBlock(node)) holds = true;
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
const selectedToc = (state: EditorState) => {
  const { selection } = state;
  return selection instanceof NodeSelection &&
    selection.node.type === schema.nodes.toc
    ? { node: selection.node, pos: selection.from }
    : null;
};

/**
 * editToc opens the settings of the selected table of contents below it:
 * how deep it lists the headings and its title, which change it at once; or
 * closes them while they are open
 */
export const editToc = (): Command => (state, dispatch, view) => {
  const selected = selectedToc(state);
  if (!selected) return false;
  if (!dispatch || !view) return true;
  // the settings button again closes them
  const open = tocPopover.value;
  if (open) {
    tocPopover.value = null;
    open.close();
    return true;
  }
  const { node, pos } = selected;
  // the table of contents still where the settings opened it
  const at = (state: EditorState) =>
    state.doc.nodeAt(pos)?.type === schema.nodes.toc ? pos : null;
  // nowhere to open them while it isn't shown, e.g. before the first
  // layout; Enter still does nothing else to it
  const box = boxOnCaretPage(view, pos, node.nodeSize);
  if (!box) return true;
  tocPopover.value = {
    anchor: box,
    depth: node.attrs.depth as number,
    title: node.attrs.title as string,
    apply: (depth, title) => {
      const pos = at(view.state);
      if (pos === null) return;
      const attrs = view.state.doc.nodeAt(pos)!.attrs;
      if (attrs.depth === depth && attrs.title === title) return;
      const tr = view.state.tr.setNodeMarkup(pos, null, {
        ...attrs,
        depth,
        title,
      });
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    },
    close: () => view.focus(),
  };
  return true;
};
