import { schema } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import {
  EditorState,
  type Plugin,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

// Node builders for the stock markdown schema the app uses.

const text = (content?: string) => (content ? [schema.text(content)] : []);

export const p = (content?: string) =>
  schema.node("paragraph", null, text(content));
export const h = (level: number, content?: string) =>
  schema.node("heading", { level }, text(content));
export const codeBlock = (content?: string) =>
  schema.node("code_block", null, text(content));
export const blockquote = (...blocks: Node[]) =>
  schema.node("blockquote", null, blocks);
export const li = (...blocks: Node[]) => schema.node("list_item", null, blocks);
export const ul = (...items: Node[]) => schema.node("bullet_list", null, items);
export const ol = (...items: Node[]) =>
  schema.node("ordered_list", null, items);
export const doc = (...blocks: Node[]) => schema.node("doc", null, blocks);

export interface StateOptions {
  // "end" (default), a cursor position or a [from, to] text selection
  cursor?: "end" | number | [number, number];
  plugins?: Plugin[];
}

/**
 * createState creates an EditorState for `node` with the given selection.
 */
export const createState = (
  node: Node,
  { cursor = "end", plugins = [] }: StateOptions = {},
) => {
  const state = EditorState.create({ schema, doc: node, plugins });
  const selection =
    cursor === "end"
      ? TextSelection.atEnd(state.doc)
      : typeof cursor === "number"
        ? TextSelection.create(state.doc, cursor)
        : TextSelection.create(state.doc, cursor[0], cursor[1]);
  return state.apply(state.tr.setSelection(selection));
};

/**
 * endOfBlock returns the position at the end of the doc's top-level block
 * at `index`, i.e. where the cursor sits after typing into that block.
 */
export const endOfBlock = (node: Node, index: number) => {
  let pos = 0;
  for (let i = 0; i <= index; i++) pos += node.child(i).nodeSize;
  return pos - 1;
};

/**
 * createTestView returns a minimal EditorView stand-in that only supports
 * `state` and `dispatch`. That is all commands, transformers and key handlers
 * use, and a real EditorView can't scroll into view in jsdom.
 */
export const createTestView = (state: EditorState): EditorView => {
  const view = {
    state,
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView;
};

/**
 * keyEvent builds a keydown event from a ProseMirror style key name such as
 * "Mod-Shift-z", "Shift-Enter" or " ". `Mod` is `Ctrl`: jsdom isn't a Mac.
 */
export const keyEvent = (combo: string) => {
  const parts = combo === " " ? [" "] : combo.split("-");
  const key = parts.pop() as string;
  const modifiers = new Set(parts);
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: modifiers.has("Mod") || modifiers.has("Ctrl"),
    shiftKey: modifiers.has("Shift"),
    altKey: modifiers.has("Alt"),
    metaKey: modifiers.has("Meta"),
    cancelable: true,
  });
};

/**
 * pressKey runs `plugin`'s keydown handler for `combo` against `view`
 * and returns the handler's result.
 */
export const pressKey = (view: EditorView, plugin: Plugin, combo: string) =>
  plugin.props.handleKeyDown?.call(plugin, view, keyEvent(combo));

/**
 * setEditorDomText renders a `.ProseMirror` element with `content`, which is
 * what commands like `exportAs` read. Returns the element.
 */
export const setEditorDomText = (content: string) => {
  const element = document.createElement("div");
  element.className = "ProseMirror";
  element.textContent = content;
  document.body.appendChild(element);
  return element;
};
