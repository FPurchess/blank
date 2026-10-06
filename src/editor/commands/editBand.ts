import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { config } from "../../config";
import { pageEngine } from "../../engine/engine";
import {
  type Band,
  bandsOn,
  documentFields,
  fieldValues,
} from "../../layout/bands";
import { changesOf } from "../../layout/choices";
import { localeUnit, systemLocale } from "../../layout/paper";
import { emptyBandNotice, pageBandParts } from "../../layout/placeholders";
import { resolveLayout } from "../../layout/resolve";
import { bandSettings, SLOTS } from "../../layout/settings";
import { expand } from "../../layout/tokens";
import {
  announce,
  bandEditor,
  engineMissing,
  pagePosition,
  path,
} from "../../state";
import { frontmatterOf } from "../../markdown";
import { writePage } from "./frontmatter";

/**
 * chapterOf returns the first heading 1 of a document, what {chapter}
 * stands for without the layout engine, which knows it for each page
 */
const chapterOf = (doc: EditorView["state"]["doc"]) => {
  let chapter: string | null = null;
  doc.descendants((node) => {
    if (
      chapter === null &&
      node.type.name === "heading" &&
      node.attrs.level === 1
    )
      chapter = node.textContent;
    return chapter === null;
  });
  return chapter;
};

/**
 * tellIfEmpty tells, through the status line, when a band that has
 * something written comes out empty on the page of the selection, because
 * its placeholders have nothing to put in there yet, e.g. {author} with no
 * author set (see emptyBandNotice)
 */
const tellIfEmpty = (view: EditorView, band: Band) => {
  const { doc } = view.state;
  const { layout } = resolveLayout(
    frontmatterOf(doc),
    config.value.layout.page,
  );
  const fields = documentFields(doc, path.value);
  const { page, pages } = pagePosition.value ?? { page: 1, pages: 1 };
  const chapter = chapterOf(doc);
  // the texts the page shows: the engine's, which knows the chapter of each
  // page, or written in here without it
  const engine = engineMissing.value ? null : pageEngine;
  const shown =
    engine?.bands(page - 1) ??
    (() => {
      const bands = bandsOn(layout, page);
      const values = fieldValues(layout, page, pages, fields, chapter ?? "");
      return [bands.header, bands.footer].flatMap((slots) =>
        SLOTS.map((slot) => expand(slots[slot], values)),
      );
    })();
  const slots = pageBandParts(layout, page - 1, pages, fields, shown);
  const notice = emptyBandNotice(
    band,
    band === "header" ? slots.slice(0, 3) : slots.slice(3, 6),
    chapter !== null,
  );
  if (notice) announce(notice);
};

/**
 * openBand opens the strip of the header or footer of the document of
 * `view`, see src/ui/BandEditor.vue
 * @param insert what to put into the center once it opens, e.g. "{page}"
 */
export const openBand = (view: EditorView, band: Band, insert?: string) => {
  // a click outside an open strip closes it first, keeping its text
  if (bandEditor.value !== null) return;
  const locale = systemLocale();
  const defaults = config.value.layout.page;
  const { settings } = resolveLayout(
    frontmatterOf(view.state.doc),
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
      tellIfEmpty(view, band);
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
