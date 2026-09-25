import { EditorView } from "prosemirror-view";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "prosemirror-markdown";

import type { BlockTransformer } from "../types";
import { applyBlockCommand } from "./util";

const cmds = ["-", "*", "+"];

type Props = boolean;

const _transformer: BlockTransformer<Props> = {
  trigger: "space",
  activate: (line: string): Props | undefined =>
    cmds.includes(line) || undefined,
  transform: (view: EditorView, line: string): boolean =>
    applyBlockCommand(view, wrapInList(schema.nodes.bullet_list), line.length),
};

export default _transformer;
