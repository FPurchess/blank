import type { Context } from "../context";
import type { Correction, InlineTransformer } from "../types";

import autolink from "./autolink";
import capitalize from "./capitalize";
import closeQuote from "./closeQuote";
import dashes from "./dashes";
import formatting from "./formatting";
import link from "./link";
import math from "./math";
import replacements from "./replacements";

// corrections that replace text; the first one that matches wins
const replacing: InlineTransformer[] = [
  // first, so a_b$ isn't made italic
  math,
  link,
  autolink,
  formatting,
  replacements,
  dashes,
];

/**
 * corrections returns the corrections to apply when the trigger of `ctx` is
 * typed: the closing quote, the first replacing one, then capitalization
 */
export const corrections = (ctx: Context): Correction[] => {
  // in math still being typed, only closing it applies: no dashes, arrows,
  // formatting or capitals in a formula's source
  if (ctx.inDollar) {
    const closed = math(ctx);
    return closed ? [closed] : [];
  }
  const result: Correction[] = [];
  // replaces a single char with another, so it goes along with any other
  // correction, e.g. the link in ‚https://blank.app‘
  const quote = closeQuote(ctx);
  if (quote) result.push(quote);
  for (const transformer of replacing) {
    const correction = transformer(ctx);
    if (correction) {
      result.push(correction);
      break;
    }
  }
  const capitalization = capitalize(ctx);
  if (capitalization) result.push(capitalization);
  return result;
};
