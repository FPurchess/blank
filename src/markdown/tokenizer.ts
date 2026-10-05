import MarkdownIt, {
  type StateBlock,
  type StateCore,
  type StateInline,
} from "markdown-it";

import { blankBlocks, blankMarker } from "./blocks/rules";
import { textAlignment } from "./alignment";
import { alignment } from "./schema";
import { parseHtmlBlock, parseHtmlTable } from "./html";

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

/**
 * underlined pushes `underline_open`, the inline tokens between `from` and
 * `to` and `underline_close`, and goes on at `end`
 */
const underlined = (
  state: StateInline,
  from: number,
  to: number,
  end: number,
) => {
  const max = state.posMax;
  state.push("underline_open", "u", 1);
  state.pos = from;
  state.posMax = to;
  state.md.inline.tokenize(state);
  state.push("underline_close", "u", -1);
  state.posMax = max;
  state.pos = end;
};

const UNDERLINE_OPEN = /^<(u|ins)>/i;

/**
 * htmlUnderline reads `<u>…</u>` and `<ins>…</ins>`, as Blank writes
 * underlined text, with markdown inside. A tag without its closing tag in
 * the same paragraph stays text, like any other HTML, as `html` is off.
 */
const htmlUnderline = (state: StateInline, silent: boolean): boolean => {
  if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
  const open = UNDERLINE_OPEN.exec(state.src.slice(state.pos, state.pos + 5));
  if (!open) return false;
  const close = `</${open[1].toLowerCase()}>`;
  const start = state.pos;
  const from = start + open[0].length;
  // the closing tag outside code spans and the like, which skipToken steps
  // over, as markdown-it finds the end of a link's text
  state.pos = from;
  let to = -1;
  while (state.pos < state.posMax) {
    if (
      state.src.slice(state.pos, state.pos + close.length).toLowerCase() ===
      close
    ) {
      to = state.pos;
      break;
    }
    state.md.inline.skipToken(state);
  }
  state.pos = start;
  if (to < 0) return false;
  if (!silent) underlined(state, from, to, to + close.length);
  else state.pos = to + close.length;
  return true;
};

const UNDERLINE_CLASS = /^\{\s*\.(underline|ul)\s*\}/;

/**
 * bracketUnderline reads pandoc's underlined spans, `[text]{.underline}` and
 * `[text]{.ul}`
 */
const bracketUnderline = (state: StateInline, silent: boolean): boolean => {
  if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, false);
  if (labelEnd < 0) return false;
  const attrs = UNDERLINE_CLASS.exec(
    state.src.slice(labelEnd + 1, state.posMax),
  );
  if (!attrs) return false;
  const end = labelEnd + 1 + attrs[0].length;
  if (!silent) underlined(state, state.pos + 1, labelEnd, end);
  else state.pos = end;
  return true;
};

const reTableTag = /<(\/?)table(?=[\s>]|$)/gi;

/**
 * htmlTable reads a whole HTML `<table>` as one `html_table` token that holds
 * the table node in its `meta`. Blank writes a table as HTML when a pipe table
 * can't hold it, e.g. with merged cells. HTML that isn't a table it can read
 * stays text, like any other HTML, as `html` is off.
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
  const content = state.getLines(startLine, line + 1, state.blkIndent, false);
  const table = parseHtmlTable(content, state.md);
  if (!table) return false;
  if (silent) return true;

  const token = state.push("html_table", "table", 0);
  token.block = true;
  token.map = [startLine, line + 1];
  token.content = content;
  token.meta = { node: table };
  state.line = line + 1;
  return true;
};

// the alignment an HTML tag's attributes give, by a `text-align` style or
// else `align` (quoted or not), as the DOM reads them; "left" for left, null
// for none
const tagAlignment = (attributes: string) => {
  const styled = /(?:^|\s)style\s*=\s*["'][^"']*\btext-align\s*:\s*([a-z]+)/i;
  const named = /(?:^|\s)align\s*=\s*["']?\s*([a-z]+)/i;
  const value = (styled.exec(attributes) ?? named.exec(attributes))?.[1];
  return alignment(value) ?? textAlignment(value);
};

const ALIGN_OPEN = /^<div(\s[^>]*)?>\s*$/i;
const ALIGN_CLOSE = /^<\/div\s*>\s*$/i;
const ALIGNED_LINE = /^<(p|h[1-6]|div)(\s[^>]*)>(.*)<\/\1\s*>\s*$/i;

interface AlignEnv {
  blankAlign?: number;
}

/**
 * alignWrapper reads how blocks at the top of the document are aligned:
 * `<div align="center">` and `</div>`, each on a line of its own around them,
 * as Blank writes them (see ./alignment.ts), become `align_open` and
 * `align_close`, which alignBlocks hands on to the blocks between them; and a
 * paragraph or heading on one line, as `<p align="center">text</p>`, is read
 * as HTML. A `</div>` without a `<div>` before it stays text, like any other
 * HTML, as `html` is off, and so does a `<div>` without an alignment outside
 * a wrapper; inside one it is counted, so its `</div>` closes it.
 */
const alignWrapper = (
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean => {
  if (state.sCount[startLine] >= 4) return false;
  const line = state.src.slice(
    state.bMarks[startLine] + state.tShift[startLine],
    state.eMarks[startLine],
  );
  const env = state.env as AlignEnv;
  const close = (env.blankAlign ?? 0) > 0 && ALIGN_CLOSE.test(line);
  // inside a list or quote, a closing tag at the line's start only ends the
  // lazy paragraph it would continue
  if (state.level !== 0 || state.blkIndent !== 0) {
    return silent && close && state.sCount[startLine] === 0;
  }
  const open = ALIGN_OPEN.exec(line);
  const align = open ? tagAlignment(open[1] ?? "") : null;
  // a <div> without an alignment inside a wrapper is counted too, so its
  // </div> doesn't close the wrapper; its blocks keep the wrapper's
  const nested = !!open && (env.blankAlign ?? 0) > 0;
  if (align || nested || close) {
    if (silent) return true;
    const token = state.push(close ? "align_close" : "align_open", "div", 0);
    token.block = true;
    token.map = [startLine, startLine + 1];
    token.meta = { align };
    env.blankAlign = (env.blankAlign ?? 0) + (close ? -1 : 1);
    state.line = startLine + 1;
    return true;
  }
  const aligned = ALIGNED_LINE.exec(line);
  const value = aligned ? tagAlignment(aligned[2]) : null;
  if (!aligned || !value) return false;
  const tag = aligned[1].toLowerCase() === "div" ? "p" : aligned[1];
  const node = parseHtmlBlock(
    `<${tag} align="${value}">${aligned[3]}</${tag}>`,
    state.md,
  );
  if (!node) return false;
  if (silent) return true;
  const token = state.push("html_block_node", tag, 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  token.content = line;
  token.meta = { node };
  state.line = startLine + 1;
  return true;
};

/**
 * alignStart forgets the wrappers of the file read before
 */
const alignStart = (state: StateCore) => {
  (state.env as AlignEnv).blankAlign = 0;
};

/**
 * alignBlocks gives the paragraphs and headings between `align_open` and
 * `align_close` their alignment, as `data-align`, and drops the two. Only
 * blocks at the top are aligned: those in lists and quotes are deeper. A
 * wrapper that isn't closed runs to the end of the file.
 */
const alignBlocks = (state: StateCore) => {
  if (!state.tokens.some((token) => token.type === "align_open")) return;
  const open: (string | null)[] = [];
  state.tokens = state.tokens.filter((token) => {
    if (token.type === "align_open") {
      // left is none; a <div> without an alignment keeps the one around it
      const { align } = token.meta as { align: string | null };
      open.push(
        align === null ? (open[open.length - 1] ?? null) : textAlignment(align),
      );
      return false;
    }
    if (token.type === "align_close") {
      open.pop();
      return false;
    }
    const align = open[open.length - 1];
    if (
      align &&
      token.level === 0 &&
      (token.type === "paragraph_open" || token.type === "heading_open")
    ) {
      token.attrSet("data-align", align);
    }
    return true;
  });
};

// a page break on a line of its own: Blank's comment, or pandoc's commands
const PAGE_BREAK = /^(?:<!--\s*pagebreak\s*-->|\\newpage|\\pagebreak)\s*$/i;

/**
 * pageBreak reads a page break, see PAGE_BREAK
 */
const pageBreak = (
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const line = state.src.slice(
    state.bMarks[startLine] + state.tShift[startLine],
    state.eMarks[startLine],
  );
  if (!PAGE_BREAK.test(line)) return false;
  if (silent) return true;
  const token = state.push("page_break", "hr", 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
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
 * with GFM pipe tables, `<br>` line breaks, HTML tables, page breaks and the
 * markers of content blocks (see ./blocks/rules.ts)
 */
export const tokenizer = MarkdownIt("commonmark", { html: false }).enable(
  "table",
);
tokenizer.inline.ruler.before("html_inline", "html_break", htmlBreak);
tokenizer.inline.ruler.before("html_inline", "html_underline", htmlUnderline);
tokenizer.inline.ruler.before("link", "bracket_underline", bracketUnderline);
tokenizer.block.ruler.before("html_block", "html_table", htmlTable, {
  alt: ["paragraph", "reference", "blockquote"],
});
// a `</div>` ends a paragraph or a list item's lazy line above it
tokenizer.block.ruler.before("html_block", "align_wrapper", alignWrapper, {
  alt: ["paragraph", "reference", "blockquote", "list"],
});
tokenizer.block.ruler.before("paragraph", "page_break", pageBreak, {
  alt: ["paragraph", "reference", "blockquote"],
});
// first, so that no other rule reads a marker line as something else, e.g. as
// a heading underlined by a `---` below it
tokenizer.block.ruler.before("table", "blank_marker", blankMarker, {
  alt: ["paragraph", "reference", "blockquote"],
});
tokenizer.core.ruler.after("block", "cell_paragraphs", cellParagraphs);
tokenizer.core.ruler.after("block", "blank_blocks", blankBlocks);
// added last, so it runs right after the blocks are read, before the content
// blocks and cells are: no wrapper token is left for them
tokenizer.core.ruler.after("block", "align_blocks", alignBlocks);
tokenizer.core.ruler.before("block", "align_start", alignStart);
