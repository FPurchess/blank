import type { Node } from "prosemirror-model";

import type { FindOptions } from "../../../state";
import { type Range, textblocks } from "../changed";

// What find and replace matches in a document: the text of its textblocks,
// never across two of them, and never across an inline node. See
// .claude/rules/find.md.

export const NO_OPTIONS: FindOptions = {
  matchCase: false,
  wholeWord: false,
  regex: false,
};

// a match: where it is, and in a regular expression what its groups caught,
// for $1 and $<name> in what replaces it
export interface Match {
  from: number;
  to: number;
  groups?: { numbered: string[]; named?: Record<string, string> };
}

// a run of text in a textblock: what's between its inline nodes, or the text
// inside one, e.g. a formula's source
interface Run {
  text: string;
  // where its first character is
  pos: number;
}

// what a whole word may not have right before or after it
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * compile returns the regular expression `query` finds with `options`, or
 * why it can't be read; null for an empty query
 */
export const compile = (
  query: string,
  options: FindOptions,
): { regex: RegExp } | { error: string } | null => {
  if (!query) return null;
  const source = options.regex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return { regex: new RegExp(source, options.matchCase ? "gu" : "giu") };
  } catch (error) {
    return { error: shortReason(error) };
  }
};

/**
 * shortReason returns why a pattern can't be read, without the pattern the
 * engine repeats in its message, e.g. "Unterminated group"
 */
const shortReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const reason = message.split(": ").pop() ?? message;
  return reason.charAt(0).toUpperCase() + reason.slice(1);
};

/**
 * runsOf returns the runs of text of `block`, a textblock at `pos`: the text
 * between its inline nodes, and the text inside each that has some
 */
const runsOf = (block: Node, pos: number): Run[] => {
  const runs: Run[] = [];
  let current: Run | null = null;
  block.forEach((child, offset) => {
    const at = pos + 1 + offset;
    if (child.isText) {
      if (current) current.text += child.text;
      else runs.push((current = { text: child.text!, pos: at }));
      return;
    }
    current = null;
    // e.g. a formula, whose source is its text
    if (child.isInline && child.childCount > 0)
      runs.push({ text: child.textContent, pos: at + 1 });
  });
  return runs;
};

const isWordAt = (text: string, index: number) =>
  index >= 0 && index < text.length && WORD_CHAR.test(text[index]);

/**
 * matchRun adds the matches of `regex` in `run` to `found`, at most `limit`
 * @returns whether there were more
 */
const matchRun = (
  run: Run,
  regex: RegExp,
  options: FindOptions,
  found: Match[],
  limit: number,
) => {
  regex.lastIndex = 0;
  for (let hit = regex.exec(run.text); hit; hit = regex.exec(run.text)) {
    const start = hit.index;
    const end = start + hit[0].length;
    // what matches nothing would match again at once
    if (end === start) {
      regex.lastIndex++;
      continue;
    }
    if (
      options.wholeWord &&
      (isWordAt(run.text, start - 1) || isWordAt(run.text, end))
    )
      continue;
    // one more than it may keep: there are more
    if (found.length >= limit) return true;
    found.push({
      from: run.pos + start,
      to: run.pos + end,
      ...(options.regex && {
        groups: {
          numbered: hit.slice(1).map((group) => group ?? ""),
          ...(hit.groups && { named: { ...hit.groups } }),
        },
      }),
    });
  }
  return false;
};

/**
 * matchIn returns the matches of `regex` in the textblocks of `doc` that
 * overlap `ranges`, in order, at most `limit`, and whether there are more
 */
export const matchIn = (
  doc: Node,
  regex: RegExp,
  options: FindOptions,
  ranges: Range[] | "all" = "all",
  limit = Infinity,
) => {
  const found: Match[] = [];
  let more = false;
  textblocks(doc, ranges, (block, pos) => {
    if (more) return;
    for (const run of runsOf(block, pos)) {
      if (matchRun(run, regex, options, found, limit)) {
        more = true;
        return;
      }
    }
  });
  return { matches: found, more };
};

/**
 * expand returns what replaces `match`: in a regular expression, with $&
 * (the match), $1 … $99 and $<name> (its groups) and $$ (a $) put in; else
 * `replacement` as it is
 * @param text the text of the match
 */
export const expand = (
  replacement: string,
  match: Match,
  text: string,
  regex: boolean,
) => {
  if (!regex) return replacement;
  const { numbered = [], named = {} } = match.groups ?? {};
  return replacement.replace(
    /\$(\$|&|<([^>]*)>|(\d{1,2}))/g,
    (whole, what: string, name?: string, digits?: string) => {
      if (what === "$") return "$";
      if (what === "&") return text;
      if (name !== undefined) return named[name] ?? whole;
      const index = Number(digits);
      // $12 with fewer groups is $1 and a 2, as in JavaScript
      if (index > numbered.length && digits!.length === 2) {
        const first = Number(digits![0]);
        return first >= 1 && first <= numbered.length
          ? numbered[first - 1] + digits![1]
          : whole;
      }
      return index >= 1 && index <= numbered.length
        ? numbered[index - 1]
        : whole;
    },
  );
};
