import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { sendNotification } from "@tauri-apps/plugin-notification";

import { config, saveDefaultPage } from "../../config";
import { errorMessage } from "../../errors";
import { changesOf } from "../../layout/choices";
import { layoutWarnings } from "../../layout/describe";
import { localeUnit, systemLocale } from "../../layout/paper";
import { resolveLayout } from "../../layout/resolve";
import {
  BAND_KEYS,
  PAGE_KEYS,
  type PageKey,
  type PageSettings,
} from "../../layout/settings";
import { frontmatterError, frontmatterOf } from "../../markdown";
import { activeTabId, announce, type PageBase, pageSetup } from "../../state";
import { changeTab } from "../tabs";
import {
  pageFrontmatter,
  pageTr,
  setFrontmatter,
  writePage,
} from "./frontmatter";

// the settings the page setup dialog sets: all but those of the header and
// footer strips
const DIALOG_KEYS = PAGE_KEYS.filter(
  (key) => !(BAND_KEYS as readonly PageKey[]).includes(key),
);

// the frontmatter as typed, as the document keeps it: nothing for an empty
// one, and no blank lines at its end
const normalize = (text: string) =>
  text.trim() === "" ? null : text.replace(/\s+$/, "");

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
  // the tab the dialog is for, which Make this my default changes once the
  // default is saved, even if another tab is shown by then
  const tab = activeTabId.value;

  const textOf = (chosen: PageSettings, base: PageBase) =>
    pageFrontmatter(
      base.frontmatter,
      changesOf(base.settings, chosen, defaults, locale),
      unit,
    ) ?? "";
  const applyText = (text: string) => {
    const error = frontmatterError(text);
    if (error !== null) return error;
    setFrontmatter(view, normalize(text));
    announce("Page setup applied");
    view.focus();
    return null;
  };

  pageSetup.value = {
    settings,
    locale,
    unit,
    frontmatter,
    warnings: layoutWarnings(problems),
    apply: (chosen, base) => applyText(textOf(chosen, base)),
    applyText,
    textOf,
    readText: (text) => {
      const error = frontmatterError(text);
      if (error !== null) return { error };
      const read = resolveLayout(normalize(text), defaults, locale);
      return {
        settings: read.settings,
        warnings: layoutWarnings(read.problems),
      };
    },
    makeDefault: (chosen) => {
      view.focus();
      // what the dialog shows; the header and footer stay the document's
      const shown = DIALOG_KEYS.map((key) => [key, chosen[key]]);
      saveDefaultPage({ ...defaults, ...Object.fromEntries(shown) }, unit)
        .then(() => {
          // the document follows the new default instead of its own settings
          const own = Object.fromEntries(DIALOG_KEYS.map((key) => [key, null]));
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
