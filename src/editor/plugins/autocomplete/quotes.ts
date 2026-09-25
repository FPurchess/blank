import type { Transaction } from "prosemirror-state";

import type { Context } from "./context";

const reLetter = /[\p{L}\p{N}]$/u;
// chars after which a quote opens rather than closes
const reOpensAfter = /(?:^|[\s￼([{–—])$/u;

/**
 * count returns how often `char` occurs in `text`
 */
const count = (text: string, char: string) => text.split(char).length - 1;

/**
 * smartQuote returns the correction that turns the straight quote `quote`,
 * just typed at the cursor, into the typographic quote of the language
 */
export const smartQuote = (
  ctx: Context,
  quote: string,
): undefined | ((tr: Transaction, pos: number) => void) => {
  if (!ctx.config.quotes || (quote !== '"' && quote !== "'")) return;

  const { quotes, quoteSpacing = "" } = ctx.rules;
  const [open, close] = quote === '"' ? quotes.double : quotes.single;
  const before = ctx.textBefore;
  // after whitespace, an opening bracket or dash, or another opening quote
  const opens =
    reOpensAfter.test(before) ||
    before.endsWith(quotes.double[0]) ||
    before.endsWith(quotes.single[0]);

  let value: string;
  if (quote === "'" && !opens && reLetter.test(before)) {
    // an apostrophe, unless it closes a single quote opened before
    value =
      close !== "’" && count(before, open) > count(before, close) ? close : "’";
  } else if (opens) {
    value = open + (quote === '"' ? quoteSpacing : "");
  } else {
    value = (quote === '"' ? quoteSpacing : "") + close;
  }

  return (tr, pos) => {
    tr.insertText(value, pos, pos + 1);
  };
};
