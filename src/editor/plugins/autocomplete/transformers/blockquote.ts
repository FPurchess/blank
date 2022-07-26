import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-markdown';

import { activator, transformer, Transformer } from '../types';

const cmd = '>';

type Props = boolean;

const activate: activator<Props> = (text: string): Props | undefined => {
  return text === cmd || undefined;
};

const transform: transformer<Props> = (
  view: EditorView,
  text: string,
): boolean => {
  const node = schema.nodes.blockquote.create(
    {},
    schema.nodes.paragraph.create(undefined, null),
  );

  const { $cursor } = view.state.selection as TextSelection;
  view.dispatch(
    view.state.tr
      .replaceRangeWith($cursor.pos - text.length, $cursor.pos, node)
      .scrollIntoView(),
  );

  const newCursor = (view.state.selection as TextSelection).$cursor;
  const endPos = view.state.doc.resolve(newCursor.pos - cmd.length - 2);
  view.dispatch(
    view.state.tr.setSelection(new TextSelection(endPos)).scrollIntoView(),
  );

  return true;
};

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
