import { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import { schema } from "prosemirror-markdown";

import type { activator, transformer, Transformer } from "../types";
import { applyBlockCommand } from "./util";

const reHeading = /^#{1,6}$/;

interface Props {
  level: number;
}

const activate: activator<Props> = (text: string): undefined | Props => {
  const match = reHeading.exec(text);
  if (match) {
    return { level: match[0].length };
  }
};

const transform: transformer<Props> = (
  view: EditorView,
  text,
  { level }: Props,
): boolean =>
  applyBlockCommand(
    view,
    setBlockType(schema.nodes.heading, { level }),
    text.length,
  );

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
