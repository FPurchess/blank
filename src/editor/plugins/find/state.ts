import type { Node } from "prosemirror-model";
import {
  type EditorState,
  PluginKey,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { type FindOptions, NO_FIND_OPTIONS } from "../../../state";
import { changedRanges, changesAll, type Range, textblocks } from "../changed";
import { compile, type Match, matchIn } from "./match";

// What find and replace looks for in the text of a tab and what it found,
// kept in each tab's editor state, so switching tabs keeps them. It follows
// edits by matching again only the textblocks a transaction changed. The
// plugin is ./index.ts, the commands ./commands.ts, the panel
// src/ui/FindPanel.vue. See .claude/rules/find.md.

// how many matches the panel counts, "1000+" beyond
export const COUNT_CAP = 1000;
// how many matches are kept, and highlighted, at most
export const STORE_CAP = 10_000;

export interface FindState {
  query: string;
  options: FindOptions;
  // whether the panel looks for it, here
  active: boolean;
  regex: RegExp | null;
  // why the pattern can't be read, if it can't
  error: string | null;
  matches: readonly Match[];
  // whether there are more matches than are kept
  more: boolean;
  // the match the panel is at, -1 for none
  current: number;
  // the matches, for the editor without the engine and the page view
  decorations: DecorationSet;
}

export type FindMeta =
  // looks for a new query, with new options, or starts or stops looking
  | {
      type: "set";
      query?: string;
      options?: FindOptions;
      active?: boolean;
    }
  // moves to the next (1) or the previous (-1) match
  | { type: "step"; direction: 1 | -1 }
  // moves to the first match from `pos` on, e.g. after one was replaced
  | { type: "from"; pos: number };

export const findKey = new PluginKey<FindState>("find");

export const findIdle: FindState = {
  query: "",
  options: NO_FIND_OPTIONS,
  active: false,
  regex: null,
  error: null,
  matches: [],
  more: false,
  current: -1,
  decorations: DecorationSet.empty,
};

const matchDecoration = ({ from, to }: Match) =>
  Decoration.inline(from, to, { class: "find-match" });

/**
 * firstFrom returns the first match from `pos` on, or the first of all when
 * none is after it; -1 for none
 */
const firstFrom = (matches: readonly Match[], pos: number) => {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.from >= pos);
  return index < 0 ? 0 : index;
};

/**
 * search looks for `query` with `options` in the whole of `doc`, the match
 * at or after `pos` the current one
 */
const search = (
  doc: Node,
  query: string,
  options: FindOptions,
  pos: number,
): FindState => {
  const compiled = compile(query, options);
  const base = { ...findIdle, query, options, active: true };
  if (!compiled) return base;
  if ("error" in compiled) return { ...base, error: compiled.error };
  const { matches, more } = matchIn(
    doc,
    compiled.regex,
    options,
    "all",
    STORE_CAP,
  );
  return {
    ...base,
    regex: compiled.regex,
    matches,
    more,
    current: firstFrom(matches, pos),
    decorations: DecorationSet.create(doc, matches.map(matchDecoration)),
  };
};

/**
 * follow keeps what `value` found up to date with the edits of `tr`: the
 * matches outside the textblocks it changed move along, and those
 * textblocks are matched again
 */
const follow = (value: FindState, tr: Transaction): FindState => {
  const { regex, options } = value;
  if (!regex) return value;
  // e.g. a Replace all: looking again is quicker than following every step
  if (changesAll(tr))
    return search(tr.doc, value.query, options, tr.selection.from);
  const blocks: Range[] = [];
  textblocks(tr.doc, changedRanges(tr), (block, pos) =>
    blocks.push([pos, pos + block.nodeSize]),
  );
  const inChanged = (match: Match) =>
    blocks.some(([from, to]) => match.from < to && match.to > from);
  const kept: Match[] = [];
  for (const match of value.matches) {
    const from = tr.mapping.mapResult(match.from, 1);
    const to = tr.mapping.mapResult(match.to, -1);
    if (from.deleted || to.deleted || to.pos <= from.pos) continue;
    const moved = { ...match, from: from.pos, to: to.pos };
    if (!inChanged(moved)) kept.push(moved);
  }
  let found = matchIn(tr.doc, regex, options, blocks, STORE_CAP + 1).matches;
  // with more than are kept, what's found past the last one kept waits for
  // the next search, so the kept ones stay the first in the document
  const last = value.matches[value.matches.length - 1];
  if (value.more && last) {
    const end = tr.mapping.map(last.to, 1);
    found = found.filter((match) => match.from < end);
  }
  let matches = merged(kept, found);
  // fewer than are kept now, and more somewhere after them: look again
  if (value.more && matches.length < STORE_CAP)
    return search(tr.doc, value.query, options, currentPos(value, tr));
  let more = value.more;
  // the decorations move along too, but in the textblocks matched again
  const mapped = value.decorations.map(tr.mapping, tr.doc);
  let decorations = mapped
    .remove(blocks.flatMap(([from, to]) => mapped.find(from, to)))
    .add(tr.doc, found.map(matchDecoration));
  if (matches.length > STORE_CAP) {
    const beyond = matches[STORE_CAP].from;
    // not the last one kept, which may end where the next starts
    decorations = decorations.remove(
      decorations
        .find(beyond, tr.doc.content.size)
        .filter((decoration) => decoration.from >= beyond),
    );
    matches = matches.slice(0, STORE_CAP);
    more = true;
  }
  return {
    ...value,
    matches,
    more,
    current: firstFrom(matches, currentPos(value, tr)),
    decorations,
  };
};

/**
 * merged returns the matches of `a` and `b`, both in order, in order
 */
const merged = (a: readonly Match[], b: readonly Match[]) => {
  if (b.length === 0) return a as Match[];
  const all: Match[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].from <= b[j].from))
      all.push(a[i++]);
    else all.push(b[j++]);
  }
  return all;
};

// where the current match was, after `tr`
const currentPos = (value: FindState, tr: Transaction) => {
  const match = value.matches[value.current];
  return match ? tr.mapping.map(match.from, -1) : tr.selection.from;
};

export const findApply = (
  tr: Transaction,
  value: FindState,
  _old: EditorState,
  state: EditorState,
): FindState => {
  const meta = tr.getMeta(findKey) as FindMeta | undefined;
  if (meta?.type === "set") {
    const active = meta.active ?? value.active;
    const query = meta.query ?? value.query;
    const options = meta.options ?? value.options;
    if (!active) return { ...findIdle, query, options };
    return search(state.doc, query, options, state.selection.from);
  }
  if (!value.active) return value;
  let next = tr.docChanged ? follow(value, tr) : value;
  if (meta?.type === "step" && next.matches.length > 0) {
    const count = next.matches.length;
    next = {
      ...next,
      current: (next.current + meta.direction + count) % count,
    };
  } else if (meta?.type === "from") {
    next = { ...next, current: firstFrom(next.matches, meta.pos) };
  }
  return next;
};

/**
 * paintedRange returns what the page view highlights for a match in `doc`
 * from `from` to `to`: the match, or the whole node of code it's in, e.g. a
 * formula, whose source the text it shows isn't
 */
export const paintedRange =
  (doc: Node) =>
  (from: number, to: number): [number, number] => {
    const $from = doc.resolve(from);
    const { parent } = $from;
    return parent.isInline && parent.type.spec.code
      ? [$from.before(), $from.after()]
      : [from, to];
  };

/**
 * currentDecorations returns the decoration of the match `value` is at, for
 * the editor and the page view, which show it apart; none without one
 */
export const currentDecorations = (value: FindState | undefined) => {
  const match = value?.matches[value.current];
  return match
    ? [Decoration.inline(match.from, match.to, { class: "find-current" })]
    : [];
};
