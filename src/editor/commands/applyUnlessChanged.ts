import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * applyUnlessChanged returns what applies the change a dialog makes once it
 * closes: it runs `change` unless the document changed while the dialog was
 * open, since the positions the dialog holds would be wrong then, and gives
 * the editor the focus back
 * @param what what the dialog changes, for the message
 */
export const applyUnlessChanged = (
  view: EditorView,
  what: "link" | "image",
) => {
  const opened = view.state.doc;
  return (change: (tr: Transaction) => void) => {
    if (view.state.doc !== opened) {
      sendNotification(`Failed to change the ${what}: the document changed`);
    } else {
      const tr = view.state.tr;
      change(tr);
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  };
};
