import {
  CLOSERS,
  OPENERS,
  strip,
  tokenSpan,
  type Context,
  type Span,
} from "../context";
import type { Transaction } from "prosemirror-state";

import type { InlineTransformer } from "../types";

export const arrows: Record<string, string> = {
  "-->": "→",
  "->": "→",
  "<--": "←",
  "<-": "←",
  "<-->": "↔",
  "<->": "↔",
  "==>": "⇒",
  "<==": "⇐",
  "<==>": "⇔",
};

// matched regardless of case
export const symbols: Record<string, string> = {
  "(c)": "©",
  "(r)": "®",
  "(tm)": "™",
  "...": "…",
  "1/2": "½",
  "1/4": "¼",
  "3/4": "¾",
  "+-": "±",
  "!=": "≠",
  "<=": "≤",
  ">=": "≥",
};

/**
 * own returns the value of `table` for `key` if `table` has it as an own
 * property, so typed words like "constructor" don't find inherited ones
 */
export const own = <T>(
  table: Record<string, T> | undefined,
  key: string,
): T | undefined =>
  table && Object.hasOwn(table, key) ? table[key] : undefined;

/**
 * lookup returns the replacement for `text`: the user's replacements for the
 * language, then for all languages, then the built-in ones
 */
export const lookup = (ctx: Context, text: string): string | undefined => {
  const { replace } = ctx.config;
  const user = (lang: string) => own(own(replace, lang), text);
  // "." after "i" may be part of "i.e."
  const builtIn = ctx.config.capitalize && ctx.trigger !== ".";
  return (
    user(ctx.lang) ??
    user("*") ??
    (builtIn ? own(ctx.rules.replace, text) : undefined) ??
    (ctx.config.arrows ? own(arrows, text) : undefined) ??
    (ctx.config.symbols ? own(symbols, text.toLowerCase()) : undefined)
  );
};

/**
 * candidates returns `span` as typed, then without the quotes and brackets
 * around it, see LibreOffice's DoAutoCorrect
 */
export const candidates = (span: Span): Span[] => [
  span,
  strip(span, OPENERS, ""),
  strip(span, "", CLOSERS),
  strip(span, OPENERS, CLOSERS),
];

/**
 * replace replaces a typed token like "-->" or "(c)" by its replacement. With
 * `suffix`, only entries ending with it apply.
 */
export const replace = (ctx: Context, span: Span, suffix = "") => {
  for (const candidate of candidates(span)) {
    if (!candidate.text || !candidate.text.endsWith(suffix)) continue;
    const value = lookup(ctx, candidate.text);
    if (value === undefined) continue;

    const from = ctx.start + candidate.index;
    const to = from + candidate.text.length;
    return (tr: Transaction) => {
      tr.insertText(value, from, to);
    };
  }
};

/**
 * replacements replaces the token before the cursor
 */
const replacements: InlineTransformer = (ctx: Context) =>
  replace(ctx, tokenSpan(ctx));

export default replacements;
