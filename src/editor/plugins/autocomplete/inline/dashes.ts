import {
  CLOSERS,
  OPENERS,
  charClass,
  isUrlLike,
  type Context,
} from "../context";
import type { InlineTransformer } from "../types";

const alnum = "[\\p{L}\\p{N}]";
const closers = `${charClass(CLOSERS)}*`;
const openers = `${charClass(OPENERS)}*`;

// "A - B" and "A -- B", where B is the word just completed
const reSpaced = new RegExp(
  `(${alnum}${closers}) (--?) (?=${openers}${alnum})[^\\s\\ufffc]*$`,
  "u",
);
// "A --B"
const reLeading = new RegExp(
  `(${alnum}${closers}) --(?=${alnum})[^\\s\\ufffc]*$`,
  "u",
);
// "A--B"
const reWord = /(?<=[\p{L}\p{N}])--(?=[\p{L}\p{N}])/gu;
const reDigit = /\p{N}/u;

/**
 * dashes turns hyphens into en and em dashes once the word after them is
 * complete, following LibreOffice's FnChgToEnEmDash:
 * "A - B" and "A -- B" become "A – B", "A --B" becomes "A –B" and "A--B"
 * becomes "A—B" ("1–2" between digits)
 */
const dashes: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.dashes || !ctx.whitespace || isUrlLike(ctx.token)) return;

  const spaced =
    reSpaced.exec(ctx.textBefore) ?? reLeading.exec(ctx.textBefore);
  if (spaced) {
    const from = ctx.start + spaced.index + spaced[1].length + 1;
    const length = spaced[2]?.length ?? 2;
    return (tr) => {
      tr.insertText(ctx.rules.spacedDash, from, from + length);
    };
  }

  const matches = [...ctx.token.matchAll(reWord)];
  if (!matches.length) return;
  return (tr) => {
    // from the last match, so the positions of the earlier ones stay valid
    for (const match of matches.reverse()) {
      const index = match.index;
      const between =
        reDigit.test(ctx.token[index - 1]) &&
        reDigit.test(ctx.token[index + 2]);
      const from = ctx.start + ctx.tokenIndex + index;
      tr.insertText(between ? "–" : ctx.rules.wordDash, from, from + 2);
    }
  };
};

export default dashes;
