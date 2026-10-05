import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, type Node, Schema, Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { FIELD_FULL_NAMES, FIELD_NAMES } from "./layout/placeholders";
import { escape, type Field, segments } from "./layout/tokens";

// The editor of one slot of a header or footer strip: a line of text with
// chips for the placeholders of tokens.ts, like the page number or the
// title, which the frontmatter writes in braces.

export const slotSchema = new Schema({
  nodes: {
    doc: { content: "inline*" },
    text: { group: "inline" },
    field: {
      group: "inline",
      inline: true,
      atom: true,
      selectable: true,
      attrs: { field: {} },
      parseDOM: [
        {
          tag: "span.chip[data-field]",
          getAttrs: (dom) => ({ field: dom.dataset.field }),
        },
      ],
      toDOM: (node) => [
        "span",
        { class: "chip", "data-field": node.attrs.field },
      ],
    },
  },
});

/**
 * chip creates the chip of a placeholder in the slot editor: its name, as
 * the pages name a placeholder that comes out empty
 */
export const chip = (field: Field) => {
  const element = document.createElement("span");
  element.className = "chip";
  element.dataset.field = field;
  // a role that takes a name, which a plain span's aria-label isn't
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", FIELD_FULL_NAMES[field]);
  element.textContent = FIELD_NAMES[field];
  return element;
};

const nodesOf = (text: string) =>
  segments(text).map((segment) =>
    typeof segment === "string"
      ? slotSchema.text(segment)
      : slotSchema.node("field", { field: segment.field }),
  );

/**
 * slotText writes the content of a slot editor as the text of the slot
 */
export const slotText = (doc: Node) => {
  let text = "";
  doc.forEach((node) => {
    text += node.isText
      ? escape(node.text ?? "")
      : `{${node.attrs.field as Field}}`;
  });
  return text.trim();
};

// what Tab, Shift+Tab, Enter and Escape do in a slot editor
export interface SlotKeys {
  next(): boolean;
  previous(): boolean;
  done(): boolean;
}

export interface SlotEditor {
  view: EditorView;
  text(): string;
  // inserts text with placeholders at the cursor, e.g. "Page {page}"
  insert(text: string): void;
  focus(): void;
  destroy(): void;
}

/**
 * createSlotEditor creates the editor of a slot in `place`
 * @param keys what Tab, Shift+Tab, Enter and Escape do
 * @param label its name for screen readers, e.g. "Footer, left"
 */
export const createSlotEditor = (
  place: HTMLElement,
  text: string,
  keys: SlotKeys,
  label: string,
): SlotEditor => {
  const setEmpty = (doc: Node) => {
    place.dataset.empty = String(doc.childCount === 0);
  };
  const view: EditorView = new EditorView(place, {
    state: EditorState.create({
      doc: slotSchema.node("doc", null, nodesOf(text)),
      plugins: [
        history(),
        keymap({
          Tab: keys.next,
          "Shift-Tab": keys.previous,
          Enter: keys.done,
          Escape: keys.done,
          "Mod-z": undo,
          "Mod-Shift-z": redo,
          "Mod-y": redo,
        }),
        keymap(baseKeymap),
      ],
    }),
    attributes: { role: "textbox", "aria-label": label },
    nodeViews: {
      field: (node) => ({ dom: chip(node.attrs.field as Field) }),
    },
    // one line: pasted text keeps its words, not its lines
    handlePaste: (view, event) => {
      const pasted = event.clipboardData?.getData("text/plain");
      if (pasted === undefined) return false;
      view.dispatch(view.state.tr.insertText(pasted.replace(/\s*\n\s*/g, " ")));
      return true;
    },
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      setEmpty(view.state.doc);
    },
  });
  setEmpty(view.state.doc);
  return {
    view,
    text: () => slotText(view.state.doc),
    insert: (inserted) => {
      const { tr, selection } = view.state;
      // a chip after a word gets a space before it, "draft Page 3"
      const before = selection.$from.nodeBefore;
      const spaced =
        before && !/\s$/.test(before.isText ? (before.text ?? "") : "")
          ? ` ${inserted}`
          : inserted;
      tr.replaceSelection(new Slice(Fragment.from(nodesOf(spaced)), 0, 0));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
};
