import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import type { Context } from "./context";

/**
 * BlockTransformer turns a whole line holding only a shortcut like "#" into
 * another block type when `trigger` is pressed at its end
 */
export interface BlockTransformer<T> {
  trigger: "space" | "enter";
  // returns the props for `transform` if `line` is the shortcut
  activate: (line: string) => undefined | T;
  // returns whether the block was transformed
  transform: (view: EditorView, line: string, props: T) => boolean;
}

/**
 * Correction applies a change to the text before the cursor to `tr`
 */
export type Correction = (tr: Transaction) => void;

/**
 * InlineTransformer corrects the text before the cursor when a trigger is
 * typed
 */
export type InlineTransformer = (ctx: Context) => undefined | Correction;
