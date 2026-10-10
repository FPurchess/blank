import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import type { Content } from "../engine/types";

// Kinds of source: text a block (or an inline node) holds and shows what it
// makes of it, e.g. a Mermaid diagram from its source, or a formula from its
// LaTeX. A kind says which node holds it, renders a source and names it; the
// editor (src/editor/plugins/sourceBlocks.ts), the pages
// (`sourceBlock` in src/engine/flatten.ts) and the exports do the rest.
//
// A source block is a wrapper node with one child `<name>_source`, which
// holds the text (see src/markdown/blocks/sourceBlock.ts). It's open while
// the selection is in that child: the pages show its source, as code, with
// what it makes below. Closed, they show only what it makes.

// what a source makes when rendered: a drawing by default
export interface VectorData {
  svg: string;
  // its own size, in CSS pixels
  width: number;
  height: number;
}

export type Rendered<T = VectorData> =
  | { ok: true; data: T }
  | { ok: false; error: string; line?: number; column?: number }
  // the library that renders it can't run here, e.g. on an old WebKit
  | { ok: "unavailable"; reason: string };

export interface SourceKind<T = VectorData> {
  // the node that holds it: the wrapper of a block, or the inline node
  node: string;
  // the language it's written in, as a code fence names it, e.g. "mermaid"
  lang: string;
  // an inline node, rather than a block; the block code leaves it be
  inline?: boolean;
  // what it is called, e.g. "Flowchart": the description where none is
  // given, and what screen readers say
  label(source: string): string;
  // what the source makes; synchronous kinds return it at once
  render(source: string): Rendered<T> | Promise<Rendered<T>>;
  // how long to wait after typing before rendering again, while it's
  // open; 250 ms by default, 0 for a kind that renders at once
  debounce?: number;
  // the engine content it is on the pages, instead of the drawing (or the
  // boxed error) of the default; called for every state
  item?(
    node: Node,
    pos: number,
    rendered: Rendered<T> | undefined,
    open: boolean,
  ): Content;
  // what the editor shows without the engine, instead of a picture of the
  // drawing
  preview?(source: string, rendered: Rendered<T> | undefined): HTMLElement;
}

const kinds = new Map<string, SourceKind<unknown>>();

/**
 * registerSource adds a kind of source; it returns what removes it again
 */
export const registerSource = <T>(kind: SourceKind<T>) => {
  kinds.set(kind.node, kind as SourceKind<unknown>);
  return () => {
    if (kinds.get(kind.node) === (kind as SourceKind<unknown>)) {
      kinds.delete(kind.node);
    }
  };
};

/**
 * sourceKind returns the kind of source the node `name` holds, if any
 */
export const sourceKind = (name: string): SourceKind<unknown> | undefined =>
  kinds.get(name);

const SOURCE_SUFFIX = "_source";

/**
 * isSourceNode tells whether `node` holds a source of a registered kind:
 * a source block's wrapper, its source, or an inline node of an inline
 * kind. Word counts leave their text out.
 */
export const isSourceNode = (node: Node) => {
  const name = node.type.name;
  if (node.type.spec.sourceBlock) return true;
  if (name.endsWith(SOURCE_SUFFIX)) {
    return (
      node.type.spec.code === true &&
      kinds.has(name.slice(0, -SOURCE_SUFFIX.length))
    );
  }
  return node.type.spec.code === true && kinds.get(name)?.inline === true;
};

export interface OpenSource {
  // the source block's wrapper, or the inline node
  node: Node;
  pos: number;
  kind: SourceKind<unknown>;
}

/**
 * openSourceAt returns the source the selection's head is in, at any
 * depth: the source block whose `<name>_source` holds it, or an inline
 * node of an inline kind. A selected source block is closed.
 */
export const openSourceAt = (state: EditorState): OpenSource | null => {
  const $head = state.selection.$head;
  for (let depth = $head.depth; depth > 0; depth--) {
    const node = $head.node(depth);
    const name = node.type.name;
    if (name.endsWith(SOURCE_SUFFIX) && node.type.spec.code) {
      const wrapper = $head.node(depth - 1);
      const kind = kinds.get(wrapper.type.name);
      if (kind && wrapper.type.spec.sourceBlock) {
        return { node: wrapper, pos: $head.before(depth - 1), kind };
      }
    }
    const kind = kinds.get(name);
    if (kind?.inline && node.type.spec.code) {
      return { node, pos: $head.before(depth), kind };
    }
  }
  return null;
};
