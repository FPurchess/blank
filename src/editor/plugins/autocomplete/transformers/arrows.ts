import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { activator, transformer, Transformer } from '../types';

const replaceMap: { [key: string]: string } = {
  '-->': '→',
  '<--': '←',
  '==>': '⇒',
  '<==': '⇐',
  '<==>': '⇔',
  '--': '—',
};

interface Props {
  key: string;
  value: string;
}

const activate: activator<Props> = (text: string): undefined | Props => {
  for (const [key, value] of Object.entries(replaceMap)) {
    if (text === key || text.endsWith(' ' + key)) {
      return { key, value };
    }
  }
};

const transform: transformer<Props> = (
  view: EditorView,
  text,
  { key, value },
): boolean => {
  const { $cursor } = view.state.selection as TextSelection;
  view.dispatch(
    view.state.tr
      .delete($cursor.pos - key.length, $cursor.pos)
      .insertText(value + ' ')
      .scrollIntoView(),
  );
  return true;
};

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
