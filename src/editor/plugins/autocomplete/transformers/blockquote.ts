import { EditorView } from "prosemirror-view";
import { wrapIn } from "prosemirror-commands";
import { schema } from "prosemirror-markdown";

import type { activator, transformer, Transformer } from "../types";
import { applyBlockCommand } from "./util";

const cmd = ">";

type Props = boolean;

const activate: activator<Props> = (text: string): Props | undefined => {
  return text === cmd || undefined;
};

const transform: transformer<Props> = (view: EditorView): boolean =>
  applyBlockCommand(view, wrapIn(schema.nodes.blockquote), cmd.length);

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
