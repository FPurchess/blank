/**
 * The rules of what `$…$` is math, in one place: the tokenizer reads by them,
 * the serializer escapes a `$` that would read as math by them, and the
 * autocorrection converts what they read as math. They are pandoc's
 * (`tex_math_dollars`), which keep prices text: the opening `$` has no space
 * after it, the closing one no space before it and no digit after it, so
 * "$5 and $10" stays text. GitHub's ``$`…`$`` is read too.
 */

export type MathDelim = "dollar" | "backtick" | "paren";

export interface MathMatch {
  /** where the opening delimiter starts and the closing one ends */
  from: number;
  to: number;
  source: string;
  delim: MathDelim;
}

const isSpace = (char: string | undefined) =>
  char === undefined || /\s/.test(char);
const isDigit = (char: string | undefined) =>
  char !== undefined && char >= "0" && char <= "9";

/**
 * escaped tells whether the character at `at` is escaped: an odd number of
 * backslashes before it
 */
export const escaped = (text: string, at: number) => {
  let count = 0;
  for (let index = at - 1; index >= 0 && text[index] === "\\"; index--) {
    count++;
  }
  return count % 2 === 1;
};

/**
 * scanDollarMath reads the inline math that starts at `at`, `$…$`,
 * ``$`…`$`` or, with `parens`, `\(…\)`, or returns null if none does. The
 * closing `$` is the first one that isn't escaped: if it can't close, the
 * opening one stays text, so text between two prices never becomes math.
 */
export const scanDollarMath = (
  text: string,
  at: number,
  parens = false,
): MathMatch | null => {
  if (parens && text.startsWith("\\(", at) && !escaped(text, at)) {
    const close = text.indexOf("\\)", at + 2);
    if (close < 0) return null;
    const source = text.slice(at + 2, close);
    if (!source.trim()) return null;
    return { from: at, to: close + 2, source, delim: "paren" };
  }
  if (text[at] !== "$" || escaped(text, at)) return null;
  // GitHub's $`…`$, whose source may hold $
  if (text[at + 1] === "`") {
    const close = text.indexOf("`$", at + 2);
    if (close < 0) return null;
    const source = text.slice(at + 2, close);
    if (!source.trim()) return null;
    return { from: at, to: close + 2, source, delim: "backtick" };
  }
  // $$ is display math, and a space after the $ makes it text
  if (text[at + 1] === "$" || isSpace(text[at + 1])) return null;
  for (let close = at + 2; close < text.length; close++) {
    if (text[close] !== "$" || escaped(text, close)) continue;
    if (isSpace(text[close - 1]) || isDigit(text[close + 1])) return null;
    return {
      from: at,
      to: close + 1,
      source: text.slice(at + 1, close),
      delim: "dollar",
    };
  }
  return null;
};

/**
 * opensMath tells whether the `$` at `at` would be read as the start of
 * math, so the serializer must write it as `\$`
 */
export const opensMath = (text: string, at: number) =>
  scanDollarMath(text, at) !== null;

// how far back before the cursor the `$` opening a formula is looked for,
// as it is typed
export const MATH_REACH = 500;

// what the editor's text has for a node that isn't text (src/editor/text.ts
// LEAF), e.g. a hard break or a formula, which math can't span
const NOT_TEXT = "\uFFFC";

/**
 * openDollar returns where an unclosed `$` that could still open math starts
 * in `text`, the text before the cursor, or -1: the last `$` with no space
 * after it and none closing it since, in the current sentence. A price
 * earlier on ("$5") doesn't count once a sentence ends after it.
 */
export const openDollar = (text: string, reach = MATH_REACH): number => {
  const start = Math.max(0, text.length - reach);
  for (let at = text.length - 1; at >= start; at--) {
    const char = text[at];
    // a sentence ended since
    if (/[.!?]/.test(char) && isSpace(text[at + 1])) return -1;
    if (char === NOT_TEXT) return -1;
    if (char !== "$" || escaped(text, at)) continue;
    if (text[at - 1] === "$") return -1;
    // one that opens what follows it, and isn't closed by a later $ (which
    // would have been found first); a number after it is a price
    const after = text.slice(at + 1);
    if (
      isSpace(after[0]) ||
      after[0] === "$" ||
      /^\d[\d.,]*(\s|$)/.test(after)
    ) {
      return -1;
    }
    return at;
  }
  return -1;
};
