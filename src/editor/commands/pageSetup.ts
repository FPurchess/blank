import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { sendNotification } from "@tauri-apps/plugin-notification";

import { config, saveDefaultPage } from "../../config";
import { errorMessage } from "../../errors";
import { changesOf } from "../../layout/choices";
import { layoutWarnings } from "../../layout/describe";
import { localeUnit, systemLocale } from "../../layout/paper";
import { resolveLayout } from "../../layout/resolve";
import { BAND_KEYS, PAGE_KEYS, type PageKey } from "../../layout/settings";
import { frontmatterError, frontmatterOf } from "../../markdown";
import { pageSetup } from "../../state";
import { setFrontmatter, writePage } from "./frontmatter";

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
  const locale = systemLocale();
  const unit = localeUnit(locale);
  const defaults = config.value.layout.page;
  const frontmatter = frontmatterOf(view.state.doc);
  const { settings, problems } = resolveLayout(frontmatter, defaults, locale);

  pageSetup.value = {
    settings,
    locale,
    unit,
    frontmatter,
    warnings: layoutWarnings(problems),
    apply: (chosen) => {
      writePage(view, changesOf(settings, chosen, defaults, locale), unit);
      view.focus();
    },
    applyText: (text) => {
      const error = frontmatterError(text);
      if (error !== null) return error;
      setFrontmatter(
        view,
        text.trim() === "" ? null : text.replace(/\s+$/, ""),
      );
      view.focus();
      return null;
    },
    makeDefault: (chosen) => {
      view.focus();
      // what the dialog shows; the header and footer stay the document's
      const shown = DIALOG_KEYS.map((key) => [key, chosen[key]]);
      saveDefaultPage({ ...defaults, ...Object.fromEntries(shown) }, unit)
        .then(() => {
          // the document follows the new default instead of its own settings
          writePage(
            view,
            Object.fromEntries(DIALOG_KEYS.map((key) => [key, null])),
            unit,
          );
          sendNotification(
            "New documents and documents without their own page setup are laid out like this now",
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
