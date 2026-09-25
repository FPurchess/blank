import { EditorView } from "prosemirror-view";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "prosemirror-markdown";

import type { activator, transformer, Transformer } from "../types";
import { applyBlockCommand } from "./util";

const cmd = "-";

type Props = boolean;

const activate: activator<Props> = (text: string): Props | undefined => {
  return text === cmd || undefined;
};

const transform: transformer<Props> = (view: EditorView): boolean =>
  applyBlockCommand(view, wrapInList(schema.nodes.bullet_list), cmd.length);

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
