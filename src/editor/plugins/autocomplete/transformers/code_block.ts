import { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import { schema } from "prosemirror-markdown";
import type { TextSelection } from "prosemirror-state";

import type { BlockTransformer } from "../types";
import { applyBlockCommand } from "./util";

// a Markdown fence with an optional language, e.g. "```ts"
const reFence = /^```([^\s`]*)$/;

interface Props {
  params: string;
}

const _transformer: BlockTransformer<Props> = {
  trigger: "enter",
  activate: (line: string): undefined | Props => {
    const match = reFence.exec(line);
    return match ? { params: match[1] } : undefined;
  },
  transform: (view: EditorView, line, { params }: Props): boolean => {
    const { $cursor } = view.state.selection as TextSelection;
    if ($cursor?.parent.type !== schema.nodes.paragraph) return false;
    return applyBlockCommand(
      view,
      setBlockType(schema.nodes.code_block, { params }),
      line.length,
    );
  },
};

export default _transformer;
