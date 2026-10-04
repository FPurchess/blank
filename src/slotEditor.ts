import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, type Node, Schema, Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import type { DocumentFields } from "./layout/bands";
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

// what a chip is called, for its tooltip
const FIELD_NAMES: Record<Field, string> = {
  page: "Page number",
  pages: "Number of pages",
  title: "Title",
  author: "Author",
  chapter: "Chapter",
  date: "Date",
  file: "File name",
};

// the placeholders that differ from page to page, which read as their name
const PER_PAGE = new Set<Field>(["page", "pages", "chapter"]);

// what a placeholder shows: its value, or the name of one that differs per
// page or has no value, e.g. an untitled document's file name
const shown = (field: Field, fields: DocumentFields) =>
  PER_PAGE.has(field)
    ? field
    : fields[field as keyof DocumentFields] || FIELD_NAMES[field];

// what a slot shows at rest, part by part: text, and chips for the
// placeholders that differ from page to page
export type PrintedPart =
  { text: string } | { field: Field; title: string; text: string };

/**
 * chipOf returns what the chip of a placeholder says and its tooltip: the
 * page numbers by name, the title and author as they read
 */
export const chipOf = (field: Field, fields: DocumentFields) => ({
  field,
  title: FIELD_NAMES[field],
  text: shown(field, fields),
});

/**
 * chip creates the chip of a placeholder in the slot editor
 */
export const chip = (field: Field, fields: DocumentFields) => {
  const { title, text } = chipOf(field, fields);
  const element = document.createElement("span");
  element.className = "chip";
  element.dataset.field = field;
  element.title = title;
  element.textContent = text;
  return element;
};

/**
 * printedParts returns the text of a slot as the edges show it at rest: the
 * placeholders as their values, and those that differ per page as chips
 */
export const printedParts = (
  text: string,
  fields: DocumentFields,
): PrintedPart[] =>
  segments(text).map((segment) => {
    if (typeof segment === "string") return { text: segment };
    const { field } = segment;
    return PER_PAGE.has(field)
      ? chipOf(field, fields)
      : { text: fields[field as keyof DocumentFields] };
  });

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
 */
export const createSlotEditor = (
  place: HTMLElement,
  text: string,
  fields: DocumentFields,
  keys: SlotKeys,
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
    nodeViews: {
      field: (node) => ({ dom: chip(node.attrs.field as Field, fields) }),
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
