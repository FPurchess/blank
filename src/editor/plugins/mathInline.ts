import type { Node } from "prosemirror-model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";

import { rangeRects, unionOf } from "../../engine/geometry";
import { inlineMarkdown } from "../../markdown/math/serialize";
import { mathPreview as previewElement } from "../../math/register";
import { mathPreview } from "../../state";
import { followLayout } from "./followLayout";

/*
 * Inline math in the editor. A formula opens as soon as the caret is in it
 * (src/sources/registry.ts, openSourceAt): the pages show its source as
 * code between faint `$`s, which stand for its node's start and end. So
 * the caret goes into it and out of it one position at a time, here rather
 * than by the webview's caret, which skips the start or end of an inline
 * node. Enter leaves it; Backspace at its start and Delete at its end turn
 * it back into its text, `$…$`; a `$` typed at its end leaves it too. A
 * formula left empty is removed.
 */

export const mathInlineKey = new PluginKey<Unwrapped | null>("mathInline");

// a formula turned back into its text, which the autocorrection doesn't
// turn into a formula again at once (src/editor/plugins/autocomplete/inline/math.ts)
export interface Unwrapped {
  from: number;
  to: number;
  text: string;
}

/**
 * mathAround returns the inline math the selection's head is in, with its
 * position, or null
 */
export const mathAround = (state: EditorState) => {
  const { $head } = state.selection;
  if ($head.parent.type.name !== "math_inline") return null;
  return { node: $head.parent, pos: $head.before() };
};

/**
 * unwrap replaces inline math with its text, `$…$`, and puts the caret
 * `offset` characters into it
 */
const unwrap = (
  state: EditorState,
  node: Node,
  pos: number,
  offset: (text: string) => number,
): Transaction => {
  const text = inlineMarkdown(node);
  const tr = state.tr.replaceWith(
    pos,
    pos + node.nodeSize,
    state.schema.text(text, node.marks),
  );
  tr.setSelection(TextSelection.create(tr.doc, pos + offset(text)));
  tr.setMeta(mathInlineKey, { from: pos, to: pos + text.length, text });
  return tr;
};

/**
 * moveTo moves the caret to `pos`, one position into or out of a formula
 */
const moveTo = (view: EditorView, pos: number) => {
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, pos))
      .scrollIntoView(),
  );
  return true;
};

/**
 * handleKey handles the keys at and in inline math, see above
 */
export const handleKey = (view: EditorView, event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $head } = selection;
  const around = mathAround(state);
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    if (event.shiftKey) return false;
    const right = event.key === "ArrowRight";
    if (around) {
      const { node, pos } = around;
      // out of it at its ends
      if (right && $head.parentOffset === node.content.size)
        return moveTo(view, pos + node.nodeSize);
      if (!right && $head.parentOffset === 0) return moveTo(view, pos);
      return false;
    }
    // into it, from beside it
    const next = right ? $head.nodeAfter : $head.nodeBefore;
    if (next?.type.name !== "math_inline") return false;
    return moveTo(view, right ? $head.pos + 1 : $head.pos - 1);
  }
  if (!around) return false;
  const { node, pos } = around;
  switch (event.key) {
    case "Enter":
    case "Escape":
      return moveTo(view, pos + node.nodeSize);
    case "Backspace":
      if ($head.parentOffset !== 0) return false;
      // its text, with the caret after the opening $
      view.dispatch(
        unwrap(state, node, pos, (text) => text.indexOf(node.textContent)),
      );
      return true;
    case "Delete":
      if ($head.parentOffset !== node.content.size) return false;
      view.dispatch(
        unwrap(
          state,
          node,
          pos,
          (text) => text.indexOf(node.textContent) + node.content.size,
        ),
      );
      return true;
    default:
      return false;
  }
};

/**
 * hide sets whether screen readers skip an element, if that changes
 */
const hide = (element: HTMLElement, hidden: boolean) => {
  if (element.getAttribute("aria-hidden") !== String(hidden))
    element.setAttribute("aria-hidden", String(hidden));
};

/**
 * MathInlineView shows inline math in the hidden editor: its source to type
 * in, and its MathML, which screen readers read as math while the caret is
 * elsewhere (and the editor shows without the engine). The MathML is filled
 * in a little later (see mathPreview in src/math/register.ts).
 */
class MathInlineView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private preview: HTMLElement;
  private shown: string;
  private open = false;

  constructor(private node: Node) {
    this.dom = document.createElement("span");
    this.dom.className = "math-inline";
    this.contentDOM = document.createElement("code");
    this.shown = node.textContent;
    this.preview = previewOf(this.shown);
    this.dom.append(this.contentDOM, this.preview);
    this.render();
  }

  setOpen(open: boolean) {
    this.open = open;
    this.dom.classList.toggle("open", open);
    this.render();
  }

  private render() {
    const source = this.node.textContent;
    if (this.shown !== source) {
      const preview = previewOf(source);
      this.preview.replaceWith(preview);
      this.preview = preview;
      this.shown = source;
    }
    // what screen readers read: the source while it's typed, else the math.
    // Only a change is written: every write is a mutation the editor reads
    hide(this.contentDOM, !this.open);
    hide(this.preview, this.open);
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  // MathML filled in later, once Temml loaded, isn't an edit, and neither
  // is what render() says to screen readers: read as one, it would draw the
  // formula again, which says it again, without end
  ignoreMutation(mutation: MutationRecord | { type: "selection" }) {
    if (mutation.type === "selection") return false;
    if (mutation.type === "attributes") return true;
    return !this.contentDOM.contains(mutation.target as globalThis.Node);
  }
}

/**
 * previewOf returns the MathML of inline math, which the editor leaves be
 */
const previewOf = (source: string) => {
  const preview = previewElement(source, false);
  preview.contentEditable = "false";
  return preview;
};

/**
 * emptyLeft returns the transaction that removes inline math left empty
 * once the selection left it, or null
 */
const emptyLeft = (
  transactions: readonly Transaction[],
  old: EditorState,
  state: EditorState,
) => {
  const was = mathAround(old);
  if (!was || was.node.content.size > 0) return null;
  const now = mathAround(state);
  // where it is now, after what the transactions changed
  const pos = transactions.reduce((at, tr) => tr.mapping.map(at, 1), was.pos);
  const node = state.doc.nodeAt(pos);
  if (now?.pos === pos || node?.type.name !== "math_inline") return null;
  if (node.content.size > 0) return null;
  return state.tr.delete(pos, pos + node.nodeSize);
};

/**
 * publishPreview publishes the preview of the inline math being edited,
 * below where it shows on the pages, or none
 */
const publishPreview = (state: EditorState) => {
  const around = mathAround(state);
  const anchor =
    around &&
    unionOf(rangeRects(around.pos, around.pos + around.node.nodeSize));
  if (!around || !anchor) {
    if (mathPreview.value) mathPreview.value = null;
    return;
  }
  const latex = around.node.textContent;
  const shown = mathPreview.value;
  if (
    shown?.latex === latex &&
    shown.anchor.left === anchor.left &&
    shown.anchor.top === anchor.top &&
    shown.anchor.right === anchor.right &&
    shown.anchor.bottom === anchor.bottom
  )
    return;
  mathPreview.value = { anchor, latex };
};

/**
 * mathInline is the plugin of inline math in the editor, see above
 */
export const mathInline = () => {
  const views = new Set<MathInlineView>();
  let open: MathInlineView | null = null;
  return new Plugin<Unwrapped | null>({
    key: mathInlineKey,
    state: {
      init: () => null,
      apply: (tr, value) => {
        const meta = tr.getMeta(mathInlineKey) as Unwrapped | undefined;
        if (meta) return meta;
        if (!value || !tr.docChanged) return value;
        const from = tr.mapping.map(value.from);
        const to = tr.mapping.map(value.to, -1);
        return to - from === value.text.length ? { ...value, from, to } : null;
      },
    },
    props: {
      nodeViews: {
        math_inline: (node) => {
          const view = new MathInlineView(node);
          views.add(view);
          return Object.assign(view, { destroy: () => views.delete(view) });
        },
      },
      handleKeyDown: handleKey,
      // a $ typed at the end of a formula closes it
      handleTextInput: (view, from, to, text) => {
        if (text !== "$" || from !== to) return false;
        const around = mathAround(view.state);
        if (!around) return false;
        const { $head } = view.state.selection;
        if ($head.parentOffset !== around.node.content.size) return false;
        return moveTo(view, around.pos + around.node.nodeSize);
      },
    },
    appendTransaction: (transactions, old, state) =>
      transactions.some((tr) => tr.selectionSet || tr.docChanged)
        ? emptyLeft(transactions, old, state)
        : null,
    view: (editor) => {
      // the preview under the formula being edited, placed again as the
      // pages move
      const publish = () => publishPreview(editor.state);
      const stop = followLayout(publish);
      return {
        update: (view) => {
          publish();
          // the open formula's view reads as its source
          const around = mathAround(view.state);
          const dom = around ? view.nodeDOM(around.pos) : null;
          const now =
            [...views].find((candidate) => candidate.dom === dom) ?? null;
          if (now === open) return;
          open?.setOpen(false);
          now?.setOpen(true);
          open = now;
        },
        destroy: () => {
          stop();
          mathPreview.value = null;
        },
      };
    },
  });
};
