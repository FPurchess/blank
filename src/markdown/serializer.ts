import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
  MarkdownSerializerState,
} from "prosemirror-markdown";
import type { Node } from "prosemirror-model";

import { closeMarker, formatMarker } from "./blocks/args";
import { ATOMS, extraArgs, formatAtom } from "./blocks/atoms";
import { formDefinition } from "./blocks/definitions";
import { writeEmbed } from "./blocks/embeds";
import { fieldSpec, isEmptyField } from "./blocks/forms";
import { schema } from "./schema";
import { gfmBlocker, gfmLines, htmlLines } from "./tables";

const { nodes, marks } = defaultMarkdownSerializer;

// `<br>`, `<table` and `<!--` typed as text are escaped, so they stay text on
// reopen, e.g. a line `<!-- pagebreak -->` that would become a page break
const HTML_START = /<(?=\/?(?:br|table)\b|!--)/gi;
// pipes too, in a paragraph that could otherwise turn into a table
const HTML_START_OR_PIPE = /<(?=\/?(?:br|table)\b|!--)|\|/gi;

/**
 * cellSerializer writes the content of a pipe table cell, with line breaks as
 * `<br>`, since a row of a pipe table is a single line
 */
const cellSerializer = new MarkdownSerializer(
  {
    ...nodes,
    hard_break: (state) => state.write("<br>"),
  },
  marks,
  { escapeExtraCharacters: HTML_START },
);

/**
 * cellText returns the markdown of a pipe table cell on a single line, with
 * its pipes escaped (which GFM requires inside code spans too)
 */
const cellText = (cell: Node): string =>
  cellSerializer
    .serialize(cell)
    .trim()
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");

const hasHardBreak = (node: Node) => {
  for (let index = 0; index < node.childCount; index++)
    if (node.child(index).type.name === "hard_break") return true;
  return false;
};

/**
 * markdownSerializer writes a document of Blank's schema as markdown: a table as a
 * pipe table if it fits one, as an HTML table otherwise
 */
export const markdownSerializer = new MarkdownSerializer(
  {
    ...nodes,
    paragraph(state, node, parent, index) {
      // an empty paragraph at the start, like the one Blank keeps before a
      // table there, would be a blank line at the top of the file
      if (index === 0 && node.childCount === 0 && parent.type.name === "doc") {
        return;
      }
      const { options } = state;
      const escaped = options.escapeExtraCharacters;
      // a line of pipes and a delimiter line after a hard break would be read
      // as a table
      if (hasHardBreak(node) && node.textContent.includes("|")) {
        options.escapeExtraCharacters = HTML_START_OR_PIPE;
      }
      nodes.paragraph(state, node, parent, index);
      options.escapeExtraCharacters = escaped;
    },
    horizontal_rule(state, node, parent, index) {
      // a file that starts with `---` would open with the text up to the next
      // `---` as its frontmatter, so a rule on top is written as `***`
      const onTop =
        index === 0 &&
        parent.type === schema.topNodeType &&
        parent.attrs.frontmatter === null;
      state.write(onTop ? "***" : (node.attrs.markup as string) || "---");
      state.closeBlock(node);
    },
    page_break(state, node) {
      state.write("<!-- pagebreak -->");
      state.closeBlock(node);
    },
    ...Object.fromEntries(
      Object.entries(ATOMS).map(([name, atom]) => [
        atom.node,
        (state: MarkdownSerializerState, node: Node) => {
          state.write(formatAtom(name, node.attrs));
          state.closeBlock(node);
        },
      ]),
    ),
    // a form: its marker, each field's marker and content, the closing
    // marker; its definition goes to the definitions section (./index.ts)
    form_block(state, node, parent) {
      const { def, extra } = node.attrs;
      const args = { def: def as string, ...extraArgs(extra, ["def"]) };
      state.write(formatMarker({ name: "form", format: 1, args }, ["def"]));
      state.closeBlock(node);
      node.forEach((field) => {
        const name = field.attrs.name as string;
        state.write(
          formatMarker({ name: "field", format: null, args: { name } }),
        );
        state.closeBlock(field);
        // an empty field is written as nothing
        const spec = fieldSpec(formDefinition(parent, node), field);
        if (!isEmptyField(field, spec)) state.renderContent(field);
      });
      state.write(closeMarker("form"));
      state.closeBlock(node);
    },
    embed(state, node) {
      state.text(writeEmbed(node.attrs), false);
      state.closeBlock(node);
    },
    unknown_block(state, node) {
      // as it was read, unescaped
      state.text(node.attrs.raw as string, false);
      state.closeBlock(node);
    },
    table(state: MarkdownSerializerState, node: Node) {
      const lines = gfmBlocker(node)
        ? htmlLines(node)
        : gfmLines(node, cellText);
      lines.forEach((line, i) => {
        if (i > 0) state.ensureNewLine();
        state.text(line, false);
      });
      state.closeBlock(node);
    },
  },
  marks,
  { escapeExtraCharacters: HTML_START },
);
