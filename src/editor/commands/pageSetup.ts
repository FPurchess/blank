import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { sendNotification } from "@tauri-apps/plugin-notification";

import { saveDefaultPage } from "../../config";
import { errorMessage } from "../../errors";
import { layoutWarnings } from "../../layout/describe";
import {
  BAND_KEYS,
  PAGE_KEYS,
  type PageChanges,
  type PageKey,
  REMOVE,
} from "../../layout/settings";
import { activeTabId, announce, pageSetup } from "../../state";
import { changeTab } from "../tabs";
import { pageEdit, pageTr, writePage } from "./frontmatter";

// the settings the page setup dialog sets: all but those of the header and
// footer strips
const DIALOG_KEYS = PAGE_KEYS.filter(
  (key) => !(BAND_KEYS as readonly PageKey[]).includes(key),
);

/**
 * openPageSetup opens the page setup dialog for the document of `view`
 */
export const openPageSetup = (view: EditorView) => {
  if (pageSetup.value !== null) return;
  const { locale, unit, defaults, settings, problems, readable, write } =
    pageEdit(view);
  // the tab the dialog is for, which Make this my default changes once the
  // default is saved, even if another tab is shown by then
  const tab = activeTabId.value;

  pageSetup.value = {
    settings,
    locale,
    unit,
    readable,
    warnings: layoutWarnings(problems),
    apply: (chosen) => {
      write(chosen);
      announce("Page setup applied");
      view.focus();
    },
    makeDefault: (chosen) => {
      view.focus();
      // what the dialog shows; the header and footer stay the document's
      const shown = DIALOG_KEYS.map((key) => [key, chosen[key]]);
      saveDefaultPage({ ...defaults, ...Object.fromEntries(shown) }, unit)
        .then(() => {
          // the document follows the new default instead of its own settings
          const own = Object.fromEntries(
            DIALOG_KEYS.map((key) => [key, REMOVE]),
          ) as PageChanges;
          // without tabs, as in tests of other modules, the view's document
          if (tab === null) writePage(view, own, unit);
          else void changeTab(tab, (state) => pageTr(state, own, unit));
          sendNotification(
            "New documents are laid out like this now, and so are documents without their own page setup.",
          );
        })
        .catch((error: unknown) =>
          sendNotification(
            `Failed to save the page setup as default: ${errorMessage(error)}`,
          ),
        );
    },
    cancel: () => view.focus(),
  };
};

export default (): Command => (_state, dispatch, view) => {
  if (dispatch && view) openPageSetup(view);
  return true;
};
