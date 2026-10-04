import type { Node } from "prosemirror-model";
import { type EditorState, NodeSelection, Plugin } from "prosemirror-state";
import { isInTable } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { fieldAt, formDefinition, schema } from "../../markdown";
import { announce, blockToolbar, type ToolbarItem } from "../../state";
import { editBlock, removeTopBlock } from "../commands/contentBlocks";
import { embedLabel } from "../../markdown/blocks/embeds";
import { boxOnCaretPage, followLayout } from "./followLayout";

// The toolbar of a content block, for the mouse: over a form while the
// cursor is in one, and over a table of contents or an embed while it is
// selected, as a click selects it. It removes the block, and edits a table
// of contents or an embed whose type Blank has, as Enter does. A table in a
// form has its own toolbar, which goes first.

/**
 * blockAt returns the content block the toolbar is for, with its name, or
 * null
 */
const blockAt = (state: EditorState) => {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const { node, from: pos } = selection;
    if (node.type === schema.nodes.toc) {
      return { node, pos, name: "Table of Contents" };
    }
    if (node.type === schema.nodes.form_block) {
      return { node, pos, name: formName(state.doc, node) };
    }
    if (node.type === schema.nodes.embed) {
      return { node, pos, name: embedLabel(node) };
    }
    return null;
  }
  if (isInTable(state)) return null;
  const at = fieldAt(selection.$head);
  return (
    at && { node: at.form, pos: at.formPos, name: formName(state.doc, at.form) }
  );
};

/**
 * formName returns what a form is called: its template's name
 */
const formName = (doc: Node, form: Node) =>
  formDefinition(doc, form)?.name ?? "Form";

/**
 * remove removes the block at `pos`, and says so
 */
const remove = (view: EditorView, pos: number, name: string) => {
  removeTopBlock(view, pos);
  announce(`${name} removed`);
  view.focus();
};

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
  ): ToolbarItem[] => [
    // a table of contents, and an embed whose type Blank has
    ...(editBlock()(view.state)
      ? [
          {
            id: "block-edit",
            label: `Edit ${name}`,
            icon: "pencil",
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
      icon: "trash",
      enabled: true,
      run: () => remove(view, pos, name),
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
        items: items(view, block.pos, block.name),
      };
    }
    const { left, top, bottom, right } = box;
    blockToolbar.value = {
      anchor: { left, top, bottom, right },
      label: block.name,
      items: itemsFor.items,
    };
  };

  return new Plugin({
    props: {
      // Enter edits the selected block
      handleKeyDown: (view, event) =>
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        editBlock()(view.state, view.dispatch, view),
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
