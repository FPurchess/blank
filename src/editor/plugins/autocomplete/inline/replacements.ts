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
 * lookup returns the replacement for `text`: the user's replacements for the
 * language, then for all languages, then the built-in ones
 */
export const lookup = (ctx: Context, text: string): string | undefined => {
  const { replace } = ctx.config;
  return (
    replace[ctx.lang]?.[text] ??
    replace["*"]?.[text] ??
    (ctx.config.capitalize ? ctx.rules.replace?.[text] : undefined) ??
    (ctx.config.arrows ? arrows[text] : undefined) ??
    (ctx.config.symbols ? symbols[text.toLowerCase()] : undefined)
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
