import { type Command, TextSelection } from "prosemirror-state";

import { scrollToText } from "../../../engine/geometry";
import {
  announce,
  type FindOptions,
  findOptions,
  findPanel,
} from "../../../state";
import { compile, expand, matchIn } from "./match";
import { type FindMeta, findKey } from "./state";

// What the find panel (src/ui/FindPanel.vue) and its keys do. See
// .claude/rules/find.md.

let asked = 0;

/**
 * openFind opens the find panel, the focus in its field, with the selected
 * text, if it's within one line, or what the tab looked for last
 */
export const openFind = (): Command => (state, dispatch) => {
  if (!dispatch) return true;
  const { from, to, $from, $to } = state.selection;
  const selected =
    from < to && $from.sameParent($to) && $from.parent.isTextblock
      ? state.doc.textBetween(from, to)
      : null;
  const meta: FindMeta = {
    type: "set",
    query: selected ?? findKey.getState(state)?.query ?? "",
    options: findOptions.value,
    active: true,
  };
  findPanel.value = { id: ++asked };
  dispatch(state.tr.setMeta(findKey, meta));
  return true;
};

/**
 * setFind looks for `query`, or with `options`, keeping the other
 */
export const setFind =
  (change: { query?: string; options?: FindOptions }): Command =>
  (state, dispatch) => {
    if (dispatch)
      dispatch(
        state.tr.setMeta(findKey, {
          type: "set",
          ...change,
          active: true,
        } satisfies FindMeta),
      );
    return true;
  };

/**
 * revealCurrent scrolls the current match of `state` into view
 */
const revealCurrent: Command = (state) => {
  const value = findKey.getState(state);
  const match = value?.matches[value.current];
  if (match) scrollToText(match.from);
  return true;
};

/**
 * stepFind moves to the next (1) or previous (-1) match, around the ends,
 * and scrolls it into view
 */
export const stepFind =
  (direction: 1 | -1): Command =>
  (state, dispatch, view) => {
    const value = findKey.getState(state);
    if (!value?.active || value.matches.length === 0) return false;
    if (!dispatch) return true;
    dispatch(
      state.tr.setMeta(findKey, { type: "step", direction } satisfies FindMeta),
    );
    return revealCurrent(view?.state ?? state);
  };

/**
 * replaceFound replaces the current match with `replacement` ($1 and the
 * like in a regular expression) and moves on to the next
 */
export const replaceFound =
  (replacement: string): Command =>
  (state, dispatch, view) => {
    const value = findKey.getState(state);
    const match = value?.matches[value.current];
    if (!value || !match) return false;
    if (!dispatch) return true;
    const text = expand(
      replacement,
      match,
      state.doc.textBetween(match.from, match.to),
      value.options.regex,
    );
    const tr = text
      ? state.tr.insertText(text, match.from, match.to)
      : state.tr.delete(match.from, match.to);
    // the next match after it, not what was put in, should it match too
    dispatch(
      tr.setMeta(findKey, {
        type: "from",
        pos: match.from + text.length,
      } satisfies FindMeta),
    );
    return revealCurrent(view?.state ?? state);
  };

/**
 * replaceAllFound replaces every match, also those beyond what the panel
 * counts, in one step to undo, and says how many
 */
export const replaceAllFound =
  (replacement: string): Command =>
  (state, dispatch) => {
    const value = findKey.getState(state);
    if (!value?.active || value.matches.length === 0) return false;
    if (!dispatch) return true;
    const compiled = compile(value.query, value.options);
    if (!compiled || "error" in compiled) return false;
    const { matches } = matchIn(state.doc, compiled.regex, value.options);
    const tr = state.tr;
    // from the end, so the positions before stay where they are
    for (const match of [...matches].reverse()) {
      const text = expand(
        replacement,
        match,
        state.doc.textBetween(match.from, match.to),
        value.options.regex,
      );
      if (text) tr.insertText(text, match.from, match.to);
      else tr.delete(match.from, match.to);
    }
    dispatch(tr);
    announce(`Replaced ${matches.length}`);
    return true;
  };

/**
 * closeFind closes the find panel and stops looking in this tab; with
 * `select`, the current match is selected in the text
 */
export const closeFind =
  (select: boolean): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const value = findKey.getState(state);
    const match = value?.matches[value.current];
    const tr = state.tr.setMeta(findKey, {
      type: "set",
      active: false,
    } satisfies FindMeta);
    if (select && match)
      tr.setSelection(TextSelection.create(state.doc, match.from, match.to));
    findPanel.value = null;
    dispatch(tr.scrollIntoView());
    return true;
  };
