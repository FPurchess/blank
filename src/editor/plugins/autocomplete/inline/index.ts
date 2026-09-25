import type { Context } from "../context";
import type { Correction, InlineTransformer } from "../types";

import autolink from "./autolink";
import capitalize from "./capitalize";
import dashes from "./dashes";
import formatting from "./formatting";
import link from "./link";
import replacements from "./replacements";

// corrections that replace text; the first one that matches wins
const replacing: InlineTransformer[] = [
  link,
  autolink,
  formatting,
  replacements,
  dashes,
];

/**
 * corrections returns the corrections to apply when the trigger of `ctx` is
 * typed: the first replacing one, then capitalization
 */
export const corrections = (ctx: Context): Correction[] => {
  const result: Correction[] = [];
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
