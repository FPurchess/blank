import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { schema } from "prosemirror-markdown";

import { imageDialog, linkDialog, transaction } from "../state";
import {
  autocomplete,
  images,
  keymap,
  languagePicker,
  openLink,
} from "./plugins";
import { applyInitialDocument } from "./document";

const dialogOpen = () =>
  linkDialog.value !== null || imageDialog.value !== null;

export const bootEditor = async () => {
  const state = await applyInitialDocument(
    EditorState.create({
      schema,
      // the picker and autocorrect see Enter and Tab before the keymap does
      plugins: [
        history(),
        languagePicker(),
        autocomplete(),
        keymap(),
        openLink(),
        images(),
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
