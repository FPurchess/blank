import type { StateBlock, StateCore, Token } from "markdown-it";

import { looksLikeMarker, type Marker, parseMarker } from "./args";
import { atomOf } from "./atoms";
import { checkEmbed } from "./embeds";
import {
  type Definition,
  definitionKey,
  definitionOf,
  readDefinition,
} from "./definitions";

// The markdown-it rules that read Blank's content blocks (see ./args.ts).
// `blankMarker` reads each marker line as a flat `blank_marker` token, and
// `blankBlocks` then turns the markers into blocks:
// - each definitions section into `env.blankDefinitions`, the ones Blank can
//   read by their key, and the YAML of the others as written into
//   `env.blankRawDefinitions`;
// - a form (`form@1` … `/form`) whose definition is there into a form_block
//   holding a form_field per `field` marker;
// - a block of one line (see ./atoms.ts, which never pairs with a closing
//   marker) into its node;
// - an embed (`embed@1` … `/embed`) holding its data and its drawing (see
//   ./embeds.ts) into an embed;
// - every block Blank doesn't know (yet), as well as markers that don't pair
//   up, into one `unknown_block` token that holds its lines exactly as they
//   were written.

export interface BlocksEnv {
  // the definitions of forms Blank can read, by their key
  blankDefinitions?: Record<string, Definition>;
  // the YAML of the others, each as its code block was written
  blankRawDefinitions?: string[];
}

/**
 * blankMarker reads a marker line. Markers stand only at the very start of a
 * line of the document: never in a quote, a list or indented. A line that
 * looks like one always ends the paragraph, table, quote or list before it,
 * so that a marker can't turn into text.
 */
export const blankMarker = (
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean => {
  const start = state.bMarks[startLine];
  // at column 0 of the source: a quote's `>` or a list item's indent moves
  // the line's start past it
  if (state.tShift[startLine] !== 0) return false;
  if (start !== 0 && state.src.charCodeAt(start - 1) !== 0x0a /* \n */) {
    return false;
  }
  const line = state.src.slice(start, state.eMarks[startLine]);
  if (!looksLikeMarker(line)) return false;
  if (silent) return true;
  if (state.level !== 0) return false;
  const token = state.push("blank_marker", "", 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  token.meta = { marker: parseMarker(line) };
  state.line = startLine + 1;
  return true;
};

const markerOf = (token: Token): Marker | null | undefined =>
  token.type === "blank_marker"
    ? ((token.meta as { marker: Marker | null }).marker ?? null)
    : undefined;

/**
 * closing returns the index of the marker that closes the one at `index`, or
 * `index` if none does: then the marker is a block of its own
 */
const closing = (tokens: Token[], index: number): number => {
  const open = markerOf(tokens[index]);
  if (!open || open.close || atomOf(open)) return index;
  let depth = 0;
  for (let at = index + 1; at < tokens.length; at++) {
    const marker = markerOf(tokens[at]);
    if (!marker || marker.name !== open.name) continue;
    if (!marker.close) depth++;
    else if (depth === 0) return at;
    else depth--;
  }
  return index;
};

/**
 * isDefinitions tells whether a section is one of definitions: only YAML
 * code blocks between its markers
 */
const isDefinitions = (open: Marker, inside: Token[]) =>
  open.name === "definitions" &&
  open.format === 1 &&
  Object.keys(open.args).length === 0 &&
  inside.every(
    (token) => token.type === "fence" && token.info.trim() === "yaml",
  );

// what a field holds at its top, by the token that opens it: what a
// form_field may hold (FIELD_CONTENT in ../schema.ts), not a page break or a
// content block
const FIELD_CONTENT = new Set([
  "paragraph_open",
  "heading_open",
  "bullet_list_open",
  "ordered_list_open",
  "blockquote_open",
  "code_block",
  "fence",
  "hr",
  "table_open",
  "html_table",
  "html_block_node",
]);

/**
 * formTokens returns the tokens of a form, `inside` being the tokens between
 * its markers: a form_block holding a form_field per `field` marker, or null
 * if the form isn't one Blank can read (no definition, a field it doesn't
 * have, other markers or blocks a field can't hold)
 */
const formTokens = (
  state: StateCore,
  open: Marker,
  inside: Token[],
  definitions: Record<string, Definition>,
): Token[] | null => {
  const { def, ...extra } = open.args;
  const definition = definitionOf(definitions, def);
  if (open.format !== 1 || !definition) return null;
  const token = (
    type: string,
    nesting: 1 | -1,
    meta: Record<string, unknown>,
  ) => {
    const made = new state.Token(type, "", nesting);
    made.block = true;
    made.meta = meta;
    return made;
  };
  const result = [token("form_block_open", 1, { attrs: { def, extra } })];
  let field: Token[] | null = null;
  const closeField = () => {
    if (!field) return;
    // an empty field holds an empty paragraph
    if (field.length === 0) {
      field.push(
        token("paragraph_open", 1, {}),
        token("paragraph_close", -1, {}),
      );
    }
    result.push(...field, token("form_field_close", -1, {}));
  };
  for (const inner of inside) {
    const marker = markerOf(inner);
    if (marker !== undefined) {
      const name = marker?.args.name;
      const known = definition.fields.some((each) => each.name === name);
      if (
        !marker ||
        marker.close ||
        marker.name !== "field" ||
        marker.format !== null ||
        Object.keys(marker.args).length !== 1 ||
        !known
      ) {
        return null;
      }
      closeField();
      result.push(token("form_field_open", 1, { attrs: { name } }));
      field = [];
      continue;
    }
    if (!field) return null;
    if (
      inner.level === 0 &&
      inner.nesting !== -1 &&
      !FIELD_CONTENT.has(inner.type)
    ) {
      return null;
    }
    field.push(inner);
  }
  if (!field) return null;
  closeField();
  result.push(token("form_block_close", -1, {}));
  return result;
};

/**
 * readDefinitions takes the definitions sections out of `tokens` into `env`,
 * and returns the tokens without them
 */
const readDefinitions = (
  tokens: Token[],
  lines: string[],
  env: BlocksEnv,
): Token[] => {
  const rest: Token[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const marker = markerOf(tokens[index]);
    const end = marker === undefined ? index : closing(tokens, index);
    const inside = tokens.slice(index + 1, end);
    if (!marker || end === index || !isDefinitions(marker, inside)) {
      rest.push(tokens[index]);
      continue;
    }
    for (const fence of inside) {
      const definition = readDefinition(fence.content);
      if (typeof definition === "string") {
        const [from, to] = fence.map ?? [0, 0];
        env.blankRawDefinitions = [
          ...(env.blankRawDefinitions ?? []),
          lines.slice(from, to).join("\n"),
        ];
      } else {
        env.blankDefinitions = {
          ...env.blankDefinitions,
          [definitionKey(definition)]: definition,
        };
      }
    }
    index = end;
  }
  return rest;
};

/**
 * embedAttrs returns the attributes of the embed `open` starts, holding the
 * tokens `inside`: its drawing's code block, after the one of its data if
 * it has data (see ./embeds.ts); null if they aren't those
 */
const embedAttrs = (open: Marker, inside: Token[]) => {
  if (open.format !== 1 || !inside.every((token) => token.type === "fence")) {
    return null;
  }
  const [data, svg] = inside.length === 2 ? inside : [null, inside[0]];
  if (inside.length > 2 || svg?.info.trim() !== "svg") return null;
  return checkEmbed(
    open.args,
    data && { text: data.content.replace(/\n$/, ""), lang: data.info.trim() },
    svg.content,
  );
};

/**
 * blankBlocks turns the markers into blocks, see the comment on top
 */
export const blankBlocks = (state: StateCore) => {
  if (!state.tokens.some((token) => token.type === "blank_marker")) return;
  const env = state.env as BlocksEnv;
  const lines = state.src.split("\n");
  // the definitions first: they come at the end, after the forms
  const tokens = readDefinitions(state.tokens, lines, env);
  const blocks: Token[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const marker = markerOf(token);
    if (marker === undefined) {
      blocks.push(token);
      continue;
    }
    const end = closing(tokens, index);
    const embed =
      marker?.name === "embed" && end > index
        ? embedAttrs(marker, tokens.slice(index + 1, end))
        : null;
    const attrs = embed ?? atomOf(marker)?.read(marker!.args);
    const form =
      marker?.name === "form" && end > index
        ? formTokens(
            state,
            marker,
            tokens.slice(index + 1, end),
            env.blankDefinitions ?? {},
          )
        : null;
    if (attrs) {
      const block = new state.Token(
        embed ? "embed" : atomOf(marker)!.node,
        "",
        0,
      );
      block.block = true;
      block.map = token.map;
      block.meta = { attrs };
      blocks.push(block);
    } else if (form) {
      blocks.push(...form);
    } else {
      const from = token.map?.[0] ?? 0;
      const to = tokens[end].map?.[1] ?? from + 1;
      const unknown = new state.Token("unknown_block", "", 0);
      unknown.block = true;
      unknown.map = [from, to];
      unknown.meta = { raw: lines.slice(from, to).join("\n") };
      blocks.push(unknown);
    }
    index = end;
  }
  state.tokens = blocks;
};
