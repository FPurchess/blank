import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { config } from "../../config";
import { type Band, documentFields } from "../../layout/bands";
import { changesOf } from "../../layout/choices";
import { localeUnit, systemLocale } from "../../layout/paper";
import { resolveLayout } from "../../layout/resolve";
import { bandSettings } from "../../layout/settings";
import { bandEditor, path } from "../../state";
import { writePage } from "./frontmatter";

/**
 * openBand opens the strip of the header or footer of the document of
 * `view`, see src/bandStrips.ts
 * @param insert what to put into the center once it opens, e.g. "{page}"
 */
export const openBand = (view: EditorView, band: Band, insert?: string) => {
  // a click outside an open strip closes it first, keeping its text
  if (bandEditor.value !== null) return;
  const locale = systemLocale();
  const defaults = config.value.layout.page;
  const { settings } = resolveLayout(
    view.state.doc.attrs.frontmatter as string | null,
    defaults,
    locale,
  );
  bandEditor.value = {
    band,
    bands: bandSettings(settings),
    fields: documentFields(view.state.doc, path.value),
    insert,
    apply: (bands) => {
      const chosen = { ...settings, ...bands };
      writePage(
        view,
        changesOf(settings, chosen, defaults, locale),
        localeUnit(locale),
      );
      view.focus();
    },
  };
};

/**
 * editBand opens the strip of the header or footer, see openBand
 * @param insert what to put into its center once it opens, e.g. "{page}"
 */
export const editBand =
  (band: Band, insert?: string): Command =>
  (_state, dispatch, view) => {
    if (dispatch && view) openBand(view, band, insert);
    return true;
  };
