import { count, tokenSpan, type Context } from "../context";
import type { InlineTransformer } from "../types";

/**
 * closeQuote turns the apostrophe ending a word into the closing single quote
 * of the language when it closes a single quote opened before it, e.g.
 * German ‚Haus’ becomes ‚Haus‘ once the word ends. Apostrophes within a word,
 * as in l’heure, stay.
 */
const closeQuote: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.quotes) return;

  const { single, double } = ctx.rules.quotes;
  const [open, close] = single;
  // where the closing quote is an apostrophe, there is nothing to tell apart,
  // and where single and double quotes look the same, as in French, an
  // apostrophe never closes a quote
  if (close === "’" || open === double[0]) return;

  // the token ends at the cursor, so the text before it ends with the token
  const { text, index } = tokenSpan(ctx);
  if (!text.endsWith("’")) return;
  const before = ctx.textBefore;
  if (count(before, open) <= count(before, close)) return;

  const from = ctx.start + index + text.length - 1;
  return (tr) => {
    tr.insertText(close, from, from + 1);
  };
};

export default closeQuote;
