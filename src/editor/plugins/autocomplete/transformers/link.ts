import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-markdown";

import type { activator, transformer, Transformer } from "../types";

const reLink = /\[([^\]]+)\]\(([^)]+)\)/;

interface Props {
  title: string;
  url: string;
  matchLength: number;
}

const activate: activator<Props> = (text: string): undefined | Props => {
  const match = reLink.exec(text);
  if (match) {
    return {
      title: match[1],
      url: match[2],
      matchLength: match[0].length,
    };
  }
  return undefined;
};

const transform: transformer<Props> = (
  view: EditorView,
  _: string,
  { title, url, matchLength }: Props,
): boolean => {
  const node = schema.text(title, [schema.marks.link.create({ href: url })]);

  const { $cursor } = view.state.selection as TextSelection;
  if (!$cursor) return false;
  view.dispatch(
    view.state.tr
      .replaceRangeWith($cursor.pos - matchLength, $cursor.pos, node)
      .insertText(" ")
      .scrollIntoView(),
  );

  return true;
};

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
