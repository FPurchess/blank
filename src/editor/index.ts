import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';

import { schema } from './schema';
import { transaction } from '../state';
import { restoreDocument } from '../storage';

import { markdownAutocomplete } from './plugins';
import keymap from './keymap';

export const bootEditor = async () => {
  const doc = await restoreDocument();
  const state = EditorState.create({
    doc,
    schema,
    plugins: [history(), keymap],
  });
  const view = new EditorView(document.body, {
    state,
    handleDOMEvents: {
      blur: (view: EditorView, e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        window.setTimeout(() => view.focus(), 100);
        return true;
      },
    },
    dispatchTransaction(tx) {
      transaction.value = tx;
      view.updateState(view.state.apply(tx));
    },
  });
  window.setTimeout(() => view.focus(), 100);
};
