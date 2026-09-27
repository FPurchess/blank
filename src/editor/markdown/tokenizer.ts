import MarkdownIt, {
  type StateBlock,
  type StateCore,
  type StateInline,
} from "markdown-it";

/**
 * htmlBreak reads `<br>`, `<br/>` and `<br />` as a hard break, which is how a
 * line break is written inside a cell of a pipe table
 */
const htmlBreak = (state: StateInline, silent: boolean): boolean => {
  if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
  const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos, state.pos + 8));
  if (!match) return false;
  if (!silent) state.push("hardbreak", "br", 0);
  state.pos += match[0].length;
  return true;
};

const reTableTag = /<(\/?)table(?=[\s>]|$)/gi;

/**
 * htmlTable reads a whole HTML `<table>` as one `html_table` token. Blank
 * writes a table as HTML when a pipe table can't hold it, e.g. with merged
 * cells. Any other HTML stays text, as `html` is off.
 */
const htmlTable = (
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const lineText = (line: number) =>
    state.src.slice(
      state.bMarks[line] + state.tShift[line],
      state.eMarks[line],
    );
  if (!/^<table(?=[\s>]|$)/i.test(lineText(startLine))) return false;

  // find the line that closes the table, nested tables included
  let depth = 0;
  let line = startLine;
  for (; line < endLine; line++) {
    // a blank line ends an HTML block, so the table is incomplete
    if (state.isEmpty(line)) return false;
    for (const [, closing] of lineText(line).matchAll(reTableTag)) {
      depth += closing ? -1 : 1;
    }
    if (depth <= 0) break;
  }
  if (depth > 0) return false;
  if (silent) return true;

  const token = state.push("html_table", "table", 0);
  token.block = true;
  token.map = [startLine, line + 1];
  token.content = state.getLines(startLine, line + 1, state.blkIndent, false);
  state.line = line + 1;
  return true;
};

/**
 * cellParagraphs wraps the inline content of every table cell in a paragraph,
 * since a cell of the schema holds blocks
 */
const cellParagraphs = (state: StateCore) => {
  const tokens = [];
  for (const [index, token] of state.tokens.entries()) {
    const previous = state.tokens[index - 1];
    const inCell =
      token.type === "inline" &&
      (previous?.type === "th_open" || previous?.type === "td_open");
    if (!inCell) {
      tokens.push(token);
      continue;
    }
    const open = new state.Token("paragraph_open", "p", 1);
    const close = new state.Token("paragraph_close", "p", -1);
    open.block = close.block = true;
    tokens.push(open, token, close);
  }
  state.tokens = tokens;
};

/**
 * tokenizer is the markdown-it instance Blank reads markdown with: CommonMark
 * with GFM pipe tables, `<br>` line breaks and HTML tables
 */
export const tokenizer = MarkdownIt("commonmark", { html: false }).enable(
  "table",
);
tokenizer.inline.ruler.before("html_inline", "html_break", htmlBreak);
tokenizer.block.ruler.before("html_block", "html_table", htmlTable, {
  alt: ["paragraph", "reference", "blockquote"],
});
tokenizer.core.ruler.after("block", "cell_paragraphs", cellParagraphs);
