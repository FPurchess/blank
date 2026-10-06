import { Fragment, type Node } from "prosemirror-model";

import { schema } from "./schema";

// Tabs at the start or the end of a line of text: markdown drops the
// whitespace there (a paragraph's, a heading's, a cell's, and every line's
// after a line break), and four columns of it start a code block. So they're
// written as `&#9;`, which reads back as a tab. A tab in the middle of a
// line, and in code, where entities stay text, is written as it is.

// what stands for such a tab while the document is written, which escaping
// and the expelling of whitespace from marks leave alone; a character of
// the private use area, which no text has
const PLACEHOLDER = "";
const ENTITY = "&#9;";

const isBreak = (node: Node | null) => node?.type === schema.nodes.hard_break;
const isCode = (node: Node) =>
  node.marks.some((mark) => mark.type === schema.marks.code);

// a text node's tabs at the start of its line, if `start`, and at its end,
// if `end`, as placeholders
const encodeText = (node: Node, start: boolean, end: boolean) => {
  let text = node.text!;
  if (start)
    text = text.replace(/^\t+/, (tabs) => PLACEHOLDER.repeat(tabs.length));
  if (end)
    text = text.replace(/\t+$/, (tabs) => PLACEHOLDER.repeat(tabs.length));
  return text === node.text ? node : schema.text(text, node.marks);
};

const encodeBlock = (block: Node): Node => {
  if (block.type === schema.nodes.code_block) return block;
  if (block.isTextblock) {
    const children: Node[] = [];
    block.forEach((child, _, index) => {
      if (!child.isText || isCode(child)) return void children.push(child);
      const start = index === 0 || isBreak(block.child(index - 1));
      const last = index === block.childCount - 1;
      const end = last || isBreak(block.child(index + 1));
      children.push(encodeText(child, start, end));
    });
    return block.copy(Fragment.from(children));
  }
  if (block.isLeaf) return block;
  const children: Node[] = [];
  block.forEach((child) => children.push(encodeBlock(child)));
  return block.copy(Fragment.from(children));
};

// whether `doc` has text with a tab outside code
const hasTabs = (doc: Node) => {
  let found = false;
  doc.descendants((node) => {
    if (found || node.type === schema.nodes.code_block) return false;
    if (node.isText && node.text!.includes("\t") && !isCode(node)) found = true;
    return !found;
  });
  return found;
};

/**
 * encodeTabs returns `doc` with the tabs that markdown would drop as
 * placeholders, which `decodeTabs` turns into entities in what's written
 */
export const encodeTabs = (doc: Node) =>
  hasTabs(doc) ? encodeBlock(doc) : doc;

/**
 * decodeTabs writes the placeholders of `encodeTabs` as `&#9;`
 */
export const decodeTabs = (markdown: string) =>
  markdown.replaceAll(PLACEHOLDER, ENTITY);
