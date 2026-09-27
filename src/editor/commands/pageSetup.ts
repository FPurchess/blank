import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { sendNotification } from "@tauri-apps/plugin-notification";

import { config, saveDefaultPage } from "../../config";
import { errorMessage } from "../../errors";
import { changesOf } from "../../layout/choices";
import { layoutWarnings } from "../../layout/describe";
import { localeUnit, systemLocale } from "../../layout/paper";
import { resolveLayout } from "../../layout/resolve";
import { type PageChanges, writePageSettings } from "../../layout/settings";
import { frontmatterError, updateFrontmatter } from "../../markdown";
import { pageSetup } from "../../state";

/**
 * openPageSetup opens the page setup dialog for the document of `view`
 */
export const openPageSetup = (view: EditorView) => {
  if (pageSetup.value !== null) return;
  const locale = systemLocale();
  const unit = localeUnit(locale);
  const defaults = config.value.layout.page;
  const frontmatter = view.state.doc.attrs.frontmatter as string | null;
  const { settings, problems } = resolveLayout(frontmatter, defaults, locale);

  // one undo step, which also undoes nothing when nothing changed
  const setFrontmatter = (next: string | null) => {
    if (next !== view.state.doc.attrs.frontmatter) {
      view.dispatch(view.state.tr.setDocAttribute("frontmatter", next));
    }
    view.focus();
  };
  const withPage = (changes: PageChanges): string | null =>
    updateFrontmatter(
      view.state.doc.attrs.frontmatter as string | null,
      (document) => writePageSettings(document, changes, unit),
    );

  pageSetup.value = {
    settings,
    locale,
    unit,
    frontmatter,
    warnings: layoutWarnings(problems),
    apply: (chosen) =>
      setFrontmatter(withPage(changesOf(settings, chosen, defaults, locale))),
    applyText: (text) => {
      const error = frontmatterError(text);
      if (error !== null) return error;
      setFrontmatter(text.trim() === "" ? null : text.replace(/\s+$/, ""));
      return null;
    },
    makeDefault: (chosen) => {
      view.focus();
      saveDefaultPage(chosen, unit)
        .then(() => {
          // the document follows the new default instead of its own settings
          setFrontmatter(
            withPage({ size: null, orientation: null, margins: null }),
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
