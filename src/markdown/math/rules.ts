import type { StateBlock, StateCore, StateInline } from "markdown-it";

import { scanDollarMath } from "./scan";

/**
 * The tokenizer's rules for math: `$…$`, ``$`…`$``, `\(…\)` and `$$…$$`
 * inline, `$$…$$` on lines of their own (with pandoc's and Quarto's
 * `{#eq-…}` label after it), and ```` ```math ```` fences. `\[…\]` isn't
 * read: Blank writes a `[` in text as `\[`.
 */

/**
 * mathInline reads inline math at the cursor (see ./scan.ts), and `$$…$$`
 * within a line, which a table's cell holds, as inline math written so
 */
export const mathInline = (state: StateInline, silent: boolean): boolean => {
  const at = state.pos;
  // only a $ or a \( starts math: the rule runs at every character that may
  // end text, so it stops early
  const first = state.src.charCodeAt(at);
  if (first !== 0x24 && first !== 0x5c) return false;
  const text = state.src.slice(0, state.posMax);
  if (text.startsWith("$$", at)) {
    const close = text.indexOf("$$", at + 2);
    const source = close > 0 ? text.slice(at + 2, close) : "";
    if (!source.trim()) return false;
    if (!silent) push(state, source, "display");
    state.pos = close + 2;
    return true;
  }
  const match = scanDollarMath(text, at, true);
  if (!match) return false;
  if (!silent) push(state, match.source, match.delim);
  state.pos = match.to;
  return true;
};

const push = (state: StateInline, source: string, delim: string) => {
  const token = state.push("math_inline", "", 0);
  token.content = source;
  token.meta = { delim };
};

// the line that closes display math: $$, maybe after the source's last line,
// with an optional {#label}
const CLOSE = /^(.*?)\$\$\s*(?:\{#([^}\s]+)\})?\s*$/;

/**
 * mathDisplay reads display math: `$$` at the start of a line up to a line
 * ending with `$$`, on one line or several. Without the closing `$$` it is
 * text.
 */
export const mathDisplay = (
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  // a line of the source, keeping its indentation within the block, as a
  // multi-line source (an aligned environment) has it
  const lineOf = (line: number) =>
    state.getLines(line, line + 1, state.blkIndent, false);
  const first = state.src.slice(
    state.bMarks[startLine] + state.tShift[startLine],
    state.eMarks[startLine],
  );
  if (!first.startsWith("$$")) return false;
  const lines: string[] = [];
  let label: string | null = null;
  let last = -1;
  // on its first line, after the $$
  const rest = first.slice(2);
  const sameLine = CLOSE.exec(rest);
  if (sameLine && rest.trim() !== "" && sameLine[1].trim() !== "") {
    lines.push(sameLine[1]);
    label = sameLine[2] ?? null;
    last = startLine;
  } else {
    if (rest.trim()) lines.push(rest);
    for (let line = startLine + 1; line < endLine; line++) {
      // a blank line ends the paragraph it would be
      if (state.isEmpty(line)) return false;
      if (state.sCount[line] < state.blkIndent) return false;
      const content = lineOf(line);
      const close = CLOSE.exec(content);
      if (close) {
        if (close[1].trim()) lines.push(close[1]);
        label = close[2] ?? null;
        last = line;
        break;
      }
      lines.push(content);
    }
  }
  if (last < 0) return false;
  const source = lines.join("\n").trim();
  if (!source) return false;
  if (silent) return true;
  const token = state.push("math_display", "", 0);
  token.block = true;
  token.content = source;
  token.meta = { label, delim: "dollar" };
  token.map = [startLine, last + 1];
  state.line = last + 1;
  return true;
};

/**
 * mathFences reads a ```` ```math ```` fence as display math, wherever it
 * is: in a list or a quote too
 */
export const mathFences = (state: StateCore) => {
  for (const token of state.tokens) {
    if (token.type !== "fence" || token.info.trim().toLowerCase() !== "math") {
      continue;
    }
    token.type = "math_display";
    token.content = token.content.replace(/\n$/, "");
    token.meta = { label: null, delim: "fence" };
  }
};
