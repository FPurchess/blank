import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { tableEditing } from "prosemirror-tables";
import { watch } from "vue";

import { schema } from "../markdown";
import { pageSetupRequests, transaction, uiTakesFocus } from "../state";
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
  tableHandles,
  tableTools,
  tableView,
} from "./plugins";
import { applyInitialDocument } from "./document";
import { openPageSetup } from "./commands/pageSetup";

let stopRequests: (() => void) | undefined;

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
        tableHandles(),
        tableEditing(),
      ],
    }),
  );
  const view = new EditorView(document.body, {
    state,
    handleDOMEvents: {
      blur: (view: EditorView, e: Event) => {
        // the dialogs take the focus while they are open
        if (uiTakesFocus.value) return false;
        e.preventDefault();
        e.stopPropagation();
        window.setTimeout(() => {
          if (!uiTakesFocus.value && !view.hasFocus()) view.focus();
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
  stopRequests?.();
  stopRequests = watch(pageSetupRequests, () => openPageSetup(view), {
    flush: "sync",
  });
  // focus the editor, unless a click was quicker, which focusing would undo
  window.setTimeout(() => {
    if (!view.hasFocus()) view.focus();
  }, 100);
};
