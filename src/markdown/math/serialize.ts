import type { MarkdownSerializerState } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";

import { fenceFor } from "../blocks/args";
import { escaped, scanDollarMath } from "./scan";

/*
 * Writing math, and keeping a `$` in text as text. A textblock's markdown is
 * written first, the math in it between MARKs, then `escapeDollars` escapes
 * each `$` of the text that the tokenizer would read as the start of math
 * (see ./scan.ts) and drops the MARKs: prices stay as they were typed.
 */

// around the math Blank writes, while a textblock's markdown is checked:
// a character of the Private Use Area, which text doesn't hold
const MARK = "";

/**
 * inlineMarkdown returns how inline math is written: `$…$` where that reads
 * back as the same source, GitHub's ``$`…`$`` or `$$…$$` as the file had
 * it, `\(…\)` otherwise (a source with a space at either end, or with a `$`)
 */
export const inlineMarkdown = (node: Node): string => {
  const source = node.textContent;
  const delim = node.attrs.delim as string;
  if (delim === "backtick" && !source.includes("`$")) return `$\`${source}\`$`;
  // $$…$$ reads up to the first $$ after the opening one, which a source
  // ending in $ (x\$) would bring forward
  const display = `$$${source}$$`;
  if (
    delim === "display" &&
    source.trim() &&
    display.indexOf("$$", 2) === source.length + 2
  ) {
    return display;
  }
  const dollars = `$${source}$`;
  const read = scanDollarMath(dollars, 0);
  if (read?.source === source && read.to === dollars.length) return dollars;
  return `\\(${source}\\)`;
};

/**
 * writeInlineMath writes inline math, marked for `escapeDollars`
 */
export const writeInlineMath = (state: MarkdownSerializerState, node: Node) => {
  state.write(MARK + inlineMarkdown(node) + MARK);
};

// what display math between $$ lines can't hold: a blank line, which ends
// it, and $$, which closes it at the end of a line
const UNSAFE = /\n\s*\n|\$\$/;

/**
 * writeDisplayMath writes display math on lines of its own, `$$` above and
 * below with its label, or as a ```` ```math ```` fence as the file had it,
 * or as its source needs: a fence holds any source as it is, but no label.
 * With a label, blank lines are left out and a `$$` is written `\$\$`,
 * which TeX reads alike or wouldn't read anyway.
 */
export const writeDisplayMath = (
  state: MarkdownSerializerState,
  node: Node,
) => {
  const source = node.textContent;
  const label = node.attrs.label as string | null;
  if (!label && (node.attrs.delim === "fence" || UNSAFE.test(source))) {
    const fence = fenceFor(source, 3);
    state.write(`${fence}math\n`);
    state.text(source, false);
    state.ensureNewLine();
    state.write(fence);
  } else {
    const safe = source.replace(/\n\s*(?=\n)/g, "").replace(/\$\$/g, "\\$\\$");
    state.write("$$\n");
    state.text(safe, false);
    state.ensureNewLine();
    state.write(label ? `$$ {#${label}}` : "$$");
  }
  state.closeBlock(node);
};

/**
 * opensMath tells whether the tokenizer would read math from the `$` at
 * `at`, as ./rules.ts reads it: `$…$`, `$$…$$` within a line, or `$$` at
 * the start of a line, which starts display math
 */
const opensMath = (text: string, at: number) => {
  if (text.startsWith("$$", at)) {
    const lineStart = at === 0 || /\n[ \t>*+-]*$/.test(text.slice(0, at));
    const close = text.indexOf("$$", at + 2);
    return lineStart || (close > 0 && text.slice(at + 2, close).trim() !== "");
  }
  return scanDollarMath(text, at) !== null;
};

/**
 * escapeDollars escapes the `$`s of a textblock's markdown the tokenizer
 * would read as the start of math, as it reads: not in code spans, link
 * destinations and autolinks, which it reads as such first, nor in the math
 * Blank wrote (between MARKs). Escaping one can make the next one open
 * math, so it reads on after each it escaped, until none does.
 */
export const escapeDollars = (markdown: string): string => {
  if (!markdown.includes("$")) return markdown.replaceAll(MARK, "");
  // the characters, and whether each is of the math written
  const chars: string[] = [];
  const kept: boolean[] = [];
  let inMath = false;
  for (const char of markdown) {
    if (char === MARK) {
      inMath = !inMath;
      continue;
    }
    chars.push(char);
    kept.push(inMath);
  }
  let text = chars.join("");
  let from = 0;
  for (;;) {
    const at = firstOpening(text, kept, from);
    if (at < 0) break;
    chars.splice(at, 0, "\\");
    kept.splice(at, 0, false);
    text = chars.join("");
    // on from the escaped one, or from the $s right before it, which
    // "$$" read with it before and may now open math alone
    from = at;
    while (from > 0 && text[from - 1] === "$" && !kept[from - 1]) from--;
    if (from === at) from = at + 2;
  }
  return text;
};

/**
 * firstOpening returns where the first `$` of text from `from` on that would
 * open math is, or -1
 */
const firstOpening = (text: string, kept: boolean[], from: number): number => {
  let at = from;
  while (at < text.length) {
    if (kept[at]) {
      at++;
      continue;
    }
    const char = text[at];
    if (char === "\\") {
      at += 2;
      continue;
    }
    // a code span: as many backticks closing it as open it
    if (char === "`") {
      let run = 1;
      while (text[at + run] === "`") run++;
      const ticks = "`".repeat(run);
      let close = text.indexOf(ticks, at + run);
      while (close >= 0 && text[close + run] === "`") {
        close = text.indexOf(ticks, close + run + 1);
      }
      at = close >= 0 ? close + run : at + run;
      continue;
    }
    // a link's destination
    if (char === "]" && text[at + 1] === "(") {
      const close = text.indexOf(")", at + 2);
      at = close >= 0 ? close + 1 : at + 2;
      continue;
    }
    // an autolink
    const autolink =
      char === "<" &&
      /^<[a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]*>/.exec(text.slice(at, at + 2000));
    if (autolink) {
      at += autolink[0].length;
      continue;
    }
    if (char === "$" && !escaped(text, at) && opensMath(text, at)) return at;
    at++;
  }
  return -1;
};

/**
 * escapingDollars writes a textblock with `write`, then escapes the `$`s in
 * what it wrote (see escapeDollars)
 */
export const escapingDollars =
  <Args extends unknown[]>(
    write: (state: MarkdownSerializerState, ...args: Args) => void,
  ) =>
  (state: MarkdownSerializerState, ...args: Args) => {
    const out = state as unknown as { out: string };
    const start = out.out.length;
    write(state, ...args);
    out.out = out.out.slice(0, start) + escapeDollars(out.out.slice(start));
  };
