import { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import { schema } from "prosemirror-markdown";

import type { BlockTransformer } from "../types";
import { applyBlockCommand } from "./util";

const reHeading = /^#{1,6}$/;

interface Props {
  level: number;
}

const _transformer: BlockTransformer<Props> = {
  trigger: "space",
  activate: (line: string): undefined | Props =>
    reHeading.test(line) ? { level: line.length } : undefined,
  transform: (view: EditorView, line, { level }: Props): boolean =>
    applyBlockCommand(
      view,
      setBlockType(schema.nodes.heading, { level }),
      line.length,
    ),
};

export default _transformer;
