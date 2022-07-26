import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-markdown';

import { activator, transformer, Transformer } from '../types';

const reHeading = /^#{1,6}$/g;

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
): boolean => {
  const node = schema.nodes.heading.create({ level });

  const { $cursor } = view.state.selection as TextSelection;
  view.dispatch(
    view.state.tr
      .replaceRangeWith($cursor.pos - text.length, $cursor.pos, node)
      .scrollIntoView(),
  );

  const sel = view.state.selection as TextSelection;
  const endPos = sel.$cursor?.before() - 1;
  const selection = new TextSelection(view.state.doc.resolve(endPos));

  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());

  return true;
};

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
