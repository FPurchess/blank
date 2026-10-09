import type { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { schema } from "../../../../markdown";
import { createSourceBlock } from "../../../../markdown/blocks/sourceBlock";
import type { BlockTransformer } from "../types";
import { replaceLineWith } from "./util";

// A fence of a source block's language, e.g. ```mermaid, and Enter: a
// source block of that kind, open, with the cursor in its source. Before
// the code block's own, which would make any fence a code block.

// the language of a fence, and the source block it makes
export const SOURCE_FENCES: Record<string, string> = {
  mermaid: "diagram",
  math: "math_display",
};

const FENCE = /^```(\w+)$/;

interface Props {
  block: string;
}

const transformer: BlockTransformer<Props> = {
  trigger: "enter",
  activate: (line) => {
    const lang = FENCE.exec(line)?.[1].toLowerCase();
    const block = lang ? SOURCE_FENCES[lang] : undefined;
    return block ? { block } : undefined;
  },
  transform: (view: EditorView, _line, { block }: Props) => {
    const { $cursor } = view.state.selection as TextSelection;
    const type = schema.nodes[block];
    if (!$cursor || !type) return false;
    // only where it may stand, e.g. a diagram at the top of the document
    const parent = $cursor.node(-1);
    const index = $cursor.index(-1);
    if (!parent.canReplaceWith(index, index + 1, type)) return false;
    // into its source, past the openings of the block and of its source
    // written back as the fence it was typed as, where the block keeps that
    const attrs = type.spec.attrs?.delim ? { delim: "fence" } : undefined;
    return replaceLineWith(view, createSourceBlock(schema, block, "", attrs), {
      cursor: 2,
    });
  },
};

export default transformer;
