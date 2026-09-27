import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { tableEditing } from "prosemirror-tables";
import { schema } from "./schema";

import {
  contextMenu as contextMenuState,
  imageDialog,
  linkDialog,
  transaction,
} from "../state";
import {
  autocomplete,
  contextMenu,
  images,
  keymap,
  languagePicker,
  openLink,
  spellcheck,
  tableGuard,
  tableKeys,
  tablePickerKeys,
  tableView,
} from "./plugins";
import { applyInitialDocument } from "./document";

// the dialogs and the context menu take the focus while they are open
const dialogOpen = () =>
  linkDialog.value !== null ||
  imageDialog.value !== null ||
  contextMenuState.value !== null;

export const bootEditor = async () => {
  const state = await applyInitialDocument(
    EditorState.create({
      schema,
      // the pickers and autocorrect see Enter and Tab before the table keys
      // and the keymap do; prosemirror-tables asks for tableEditing last
      plugins: [
        history(),
        languagePicker(),
        tablePickerKeys(),
        contextMenu(),
        spellcheck(),
        autocomplete(),
        tableKeys(),
        keymap(),
        openLink(),
        images(),
        tableGuard(),
        tableView(),
        tableEditing(),
      ],
    }),
  );
  const view = new EditorView(document.body, {
    state,
    handleDOMEvents: {
      blur: (view: EditorView, e: Event) => {
        // the dialogs take the focus while they are open
        if (dialogOpen()) return false;
        e.preventDefault();
        e.stopPropagation();
        window.setTimeout(() => {
          if (!dialogOpen()) view.focus();
        }, 100);
        return true;
      },
    },
    dispatchTransaction(tx) {
      transaction.value = tx;
      view.updateState(view.state.apply(tx));
    },
  });
  transaction.value = view.state.tr;
  window.setTimeout(() => view.focus(), 100);
};
