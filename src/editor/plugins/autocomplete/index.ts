import { Plugin, type TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  createContext,
  TEXT_TRIGGERS,
  tokenSpan,
  type Trigger,
} from "./context";
import { dispatchCorrection } from "./history";
import { corrections } from "./inline";
import { replace } from "./inline/replacements";
import { smartQuote } from "./quotes";
import blockTransformers from "./transformers";

/**
 * applyBlock runs the first block shortcut for `trigger` that matches the
 * whole line before the cursor
 * @returns whether a block shortcut was applied
 */
const applyBlock = (view: EditorView, trigger: "space" | "enter") => {
  const ctx = createContext(view.state, trigger);
  if (!ctx?.config.blocks) return false;
  const { $cursor } = ctx;
  if ($cursor.parentOffset !== $cursor.parent.content.size) return false;

  for (const transformer of Object.values(blockTransformers)) {
    if (transformer.trigger !== trigger) continue;
    const props = transformer.activate(ctx.textBefore);
    if (
      props !== undefined &&
      transformer.transform(view, ctx.textBefore, props)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * correct applies the inline corrections for `trigger`, which has not been
 * inserted
 * @returns whether anything was corrected
 */
const correct = (view: EditorView, trigger: Trigger) => {
  const ctx = createContext(view.state, trigger);
  if (!ctx) return false;
  const list = corrections(ctx);
  if (!list.length) return false;

  const tr = view.state.tr;
  list.forEach((correction) => correction(tr));
  dispatchCorrection(view, tr);
  return true;
};

/**
 * insert inserts `text` typed over `from`..`to` like the browser would
 */
const insert = (view: EditorView, from: number, to: number, text: string) =>
  view.dispatch(view.state.tr.insertText(text, from, to));

/**
 * handleTextInput applies autocorrect to typed text
 */
const handleTextInput = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean => {
  if (from !== to || text.length !== 1) return false;
  const ctx = createContext(view.state, text);
  if (!ctx) return false;

  // typographic quotes
  const quote = smartQuote(ctx, text);
  if (quote) {
    insert(view, from, to, text);
    const tr = view.state.tr;
    quote(tr, from);
    dispatchCorrection(view, tr);
    return true;
  }

  // entries ending with ")" like "(c)" apply as soon as it's typed, see Word
  if (text === ")") {
    const span = tokenSpan(ctx);
    const correction = replace(ctx, { ...span, text: span.text + ")" }, ")");
    if (!correction) return false;
    insert(view, from, to, text);
    const tr = view.state.tr;
    correction(tr);
    dispatchCorrection(view, tr);
    return true;
  }

  if (!TEXT_TRIGGERS.has(text)) return false;
  if (text === " " && applyBlock(view, "space")) return true;

  const list = corrections(ctx);
  if (!list.length) return false;
  // insert the trigger first, so undoing the correction keeps it
  insert(view, from, to, text);
  const tr = view.state.tr;
  list.forEach((correction) => correction(tr));
  dispatchCorrection(view, tr);
  return true;
};

/**
 * handleKeyDown applies autocorrect for Enter and Tab, then lets the keymap
 * split the block or indent as usual
 */
const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (event.key !== "Enter" && event.key !== "Tab") return false;
  if (!(view.state.selection as TextSelection).$cursor) return false;

  if (event.key === "Enter" && applyBlock(view, "enter")) return true;
  correct(view, event.key);
  return false;
};

export default () =>
  new Plugin({
    props: {
      handleTextInput,
      handleKeyDown,
    },
  });
