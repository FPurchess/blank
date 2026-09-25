import { EditorView } from "prosemirror-view";
import { wrapIn } from "prosemirror-commands";
import { schema } from "prosemirror-markdown";

import type { BlockTransformer } from "../types";
import { applyBlockCommand } from "./util";

const cmd = ">";

type Props = boolean;

const _transformer: BlockTransformer<Props> = {
  trigger: "space",
  activate: (line: string): Props | undefined => line === cmd || undefined,
  transform: (view: EditorView): boolean =>
    applyBlockCommand(view, wrapIn(schema.nodes.blockquote), cmd.length),
};

export default _transformer;
