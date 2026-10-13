import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  Selection,
} from "prosemirror-state";
import { isInTable } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { fieldAt } from "../../markdown";
import { blockName, isContentBlock } from "../../markdown/blocks/names";
import { blockToolbar, type ToolbarItem } from "../../state";
import {
  editBlock,
  pasteTopBlocks,
  removeTopBlock,
} from "../commands/contentBlocks";
import { boxOnCaretPage, followLayout } from "./followLayout";
import { fieldEntry } from "./forms";
import { CommandIdentifier } from "../../config";
import { commandShortcut } from "../keyBindings";
import { enterSource, openBlock } from "./sourceBlocks";

// The toolbar of a content block, for the mouse: over a form while the
// cursor is in one, and over a table of contents or an embed while it is
// selected, as a click selects it. It removes the block, and edits a table
// of contents or an embed whose type Blank has, as Enter does. A table in a
// form has its own toolbar, which goes first. The plugin also pastes content
// blocks where they can stand.

/**
 * blockAt returns the content block the toolbar is for, with its name, or
 * null
 */
const blockAt = (state: EditorState) => {
  const { selection, doc } = state;
  if (selection instanceof NodeSelection) {
    const { node, from: pos } = selection;
    return isContentBlock(node)
      ? { node, pos, name: blockName(doc, node) }
      : null;
  }
  // a source block whose source is open, e.g. a diagram being typed
  const open = openBlock(state);
  if (open) {
    return { node: open.node, pos: open.pos, name: blockName(doc, open.node) };
  }
  if (isInTable(state)) return null;
  const at = fieldAt(selection.$head);
  return (
    at && { node: at.form, pos: at.formPos, name: blockName(doc, at.form) }
  );
};

// the icon a toolbar shows by the name of its block
const ICONS: Record<string, string> = {
  toc: "toc",
  form_block: "form",
  embed: "embed",
  diagram: "flow",
  unknown_block: "info",
};

/**
 * enterForm puts the cursor into the first field of the selected form, as
 * Tab enters a field
 */
const enterForm: Command = (state, dispatch) => {
  const { selection } = state;
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== "form_block" ||
    selection.node.childCount === 0
  )
    return false;
  const at = fieldEntry(selection.node.child(0), selection.from + 1);
  const inside = Selection.findFrom(state.doc.resolve(at), 1, true);
  if (!inside) return false;
  dispatch?.(state.tr.setSelection(inside).scrollIntoView());
  return true;
};

/**
 * enterBlock goes into the selected block: a form's first field, or a
 * source block's source, which opens it
 */
const enterBlock: Command = (state, dispatch) =>
  enterForm(state, dispatch) || enterSource(state, dispatch);

/**
 * blockTools shows the toolbar of the content block the cursor is in or on
 */
export const blockTools = () => {
  /**
   * items returns the buttons for the block at `pos`
   */
  const items = (
    view: EditorView,
    pos: number,
    name: string,
    selected: boolean,
  ): ToolbarItem[] => [
    // a table of contents, a diagram, and an embed whose type Blank has:
    // Shift+Enter (block.settings) opens them
    ...(editBlock()(view.state)
      ? [
          {
            id: "block-edit",
            label: "Settings",
            icon: "pencil",
            key: commandShortcut(CommandIdentifier.BLOCK_SETTINGS),
            enabled: true,
            run: () => {
              editBlock()(view.state, view.dispatch, view);
            },
          },
        ]
      : []),
    {
      id: "block-remove",
      label: `Remove ${name}`,
      tip: "Remove block",
      icon: "trash",
      // Backspace removes a selected block; in a form's field, it deletes
      // text
      ...(selected ? { key: "Backspace" } : {}),
      enabled: true,
      run: () => {
        removeTopBlock(view, pos);
        view.focus();
      },
    },
  ];

  // the buttons stay the same while the block and the selection's kind do,
  // so the toolbar doesn't update them while scrolling
  let itemsFor: {
    node: Node;
    pos: number;
    selected: boolean;
    items: ToolbarItem[];
  } | null = null;

  /**
   * publish shows the toolbar of the block at the cursor, or hides it
   */
  const publish = (view: EditorView) => {
    const block = blockAt(view.state);
    const box = block && boxOnCaretPage(view, block.pos, block.node.nodeSize);
    if (!block || !box) {
      if (blockToolbar.value) blockToolbar.value = null;
      itemsFor = null;
      return;
    }
    const selected = view.state.selection instanceof NodeSelection;
    if (
      itemsFor?.node !== block.node ||
      itemsFor.pos !== block.pos ||
      itemsFor.selected !== selected
    ) {
      itemsFor = {
        node: block.node,
        pos: block.pos,
        selected,
        items: items(view, block.pos, block.name, selected),
      };
    }
    const { left, top, bottom, right } = box;
    blockToolbar.value = {
      anchor: { left, top, bottom, right },
      label: block.name,
      icon: ICONS[block.node.type.name] ?? "info",
      items: itemsFor.items,
    };
  };

  return new Plugin({
    props: {
      // content blocks pasted into a table, list or quote go after it, at
      // the top of the document
      handlePaste: (view, _event, slice) => pasteTopBlocks(view, slice),
      // Enter opens a selected source block, edits the selected block, or
      // goes into a selected form
      handleKeyDown: (view, event) =>
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (enterSource(view.state, view.dispatch) ||
          // the settings of a selected block only: in an open source block
          // Enter starts a new line (Shift+Enter opens its settings there)
          (view.state.selection instanceof NodeSelection &&
            editBlock()(view.state, view.dispatch, view)) ||
          enterForm(view.state, view.dispatch)),
      // typing on a selected form, as after inserting it, fills its first
      // field rather than replacing the form; on a selected source block, it
      // goes on at the end of its source
      handleTextInput: (view, _from, _to, text) => {
        if (!enterBlock(view.state, view.dispatch)) return false;
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    view(view) {
      const unfollow = followLayout(() => publish(view));
      publish(view);
      return {
        update: (view) => publish(view),
        destroy: () => {
          unfollow();
          blockToolbar.value = null;
        },
      };
    },
  });
};
