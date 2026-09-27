import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { tableEditing } from "prosemirror-tables";
import { schema } from "../markdown";

import {
  contextMenu as contextMenuState,
  imageDialog,
  linkDialog,
  pageSetup,
  pageSetupRequests,
  tableToolbar,
  transaction,
} from "../state";
import {
  autocomplete,
  contextMenu,
  images,
  keymap,
  languagePicker,
  openLink,
  properties,
  spellcheck,
  tableGuard,
  tableKeys,
  tablePickerKeys,
  tableTools,
  tableView,
} from "./plugins";
import { applyInitialDocument } from "./document";
import { openPageSetup } from "./commands/pageSetup";

// the dialogs, the context menu and the caption field of the table toolbar
// take the focus while they are open
const dialogOpen = () =>
  linkDialog.value !== null ||
  imageDialog.value !== null ||
  pageSetup.value !== null ||
  contextMenuState.value !== null ||
  !!tableToolbar.value?.caption;

let unsubscribeRequests: (() => void) | undefined;

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
        tableTools(),
        contextMenu(),
        spellcheck(),
        autocomplete(),
        tableKeys(),
        keymap(),
        openLink(),
        images(),
        properties(),
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
  // e.g. the button in the bottom bar asks for the page setup
  unsubscribeRequests?.();
  unsubscribeRequests = pageSetupRequests.subscribe(() => openPageSetup(view));
  window.setTimeout(() => view.focus(), 100);
};
