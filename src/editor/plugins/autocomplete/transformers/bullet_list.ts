import { TextSelection, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { wrapInList } from 'prosemirror-schema-list';
import { schema } from 'prosemirror-markdown';

import { activator, transformer, Transformer } from '../types';

const cmd = '-';

type Props = boolean;

const activate: activator<Props> = (text: string): Props | undefined => {
  return text === cmd || undefined;
};

const transform: transformer<Props> = (
  view: EditorView,
  text: string,
): boolean => {
  if (
    wrapInList(schema.nodes.bullet_list)(
      view.state,
      (tr: Transaction) => view.dispatch(tr),
      view,
    )
  ) {
    const { $cursor } = view.state.selection as TextSelection;
    view.dispatch(
      view.state.tr
        .delete($cursor.pos - cmd.length, $cursor.pos)
        .scrollIntoView(),
    );
    return true;
  }
  return false;
};

const _transformer: Transformer<Props> = {
  activate,
  transform,
};

export default _transformer;
