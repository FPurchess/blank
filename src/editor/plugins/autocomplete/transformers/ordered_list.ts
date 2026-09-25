import { EditorView } from "prosemirror-view";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "prosemirror-markdown";

import type { BlockTransformer } from "../types";
import { applyBlockCommand } from "./util";

const reOrderedList = /^(\d{1,9})\.$/;

interface Props {
  order: number;
}

const _transformer: BlockTransformer<Props> = {
  trigger: "space",
  activate: (line: string): undefined | Props => {
    const match = reOrderedList.exec(line);
    return match ? { order: Number(match[1]) } : undefined;
  },
  transform: (view: EditorView, line, { order }: Props): boolean =>
    applyBlockCommand(
      view,
      wrapInList(schema.nodes.ordered_list, { order }),
      line.length,
    ),
};

export default _transformer;
