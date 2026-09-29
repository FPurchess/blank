import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { tableEditing } from "prosemirror-tables";

import { schema } from "../markdown";
import { transaction, uiTakesFocus } from "../state";
import {
  autocomplete,
  contextMenu,
  images,
  keymap,
  languagePicker,
  openLink,
  pageView,
  properties,
  spellcheck,
  tableGuard,
  tableKeys,
  tablePickerKeys,
  tableClipboard,
  tableHandles,
  tableTools,
  tableView,
} from "./plugins";
import { applyInitialDocument } from "./document";
import { createEditorHandle, syncPlugin } from "./handle";
import { timed } from "../engine/perf";

/**
 * bootEditor mounts the editor with the first document
 * @returns the handle the UI works with the editor through
 */
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
        // moves by the lines the page view shows, before the keymap
        pageView(),
        keymap(),
        openLink(),
        images(),
        properties(),
        tableGuard(),
        tableView(),
        tableHandles(),
        // before tableEditing, whose paste it wraps
        tableClipboard(),
        tableEditing(),
      ],
    }),
  );
  // keeps the handle's state up to date, once the handle exists
  let sync = () => {};
  const view = new EditorView(document.body, {
    state,
    plugins: [syncPlugin(() => sync())],
    // the main text, which the slot editors of the header and footer strips
    // share the .ProseMirror class with
    attributes: { id: "editor" },
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
      // the editor's whole update, for the page view's measurements
      timed("dispatch", () => {
        transaction.value = tx;
        view.updateState(view.state.apply(tx));
      });
    },
  });
  const editor = createEditorHandle(view);
  sync = editor.sync;
  transaction.value = view.state.tr;
  // focus the editor, unless a click was quicker, which focusing would undo
  window.setTimeout(() => {
    if (!view.hasFocus()) view.focus();
  }, 100);
  return editor.handle;
};
