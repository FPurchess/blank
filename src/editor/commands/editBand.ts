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
import { pageInView } from "../../engine/geometry";
import {
  announce,
  bandEditor,
  engineMissing,
  pageLayoutState,
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
 * something written comes out empty on the page it was edited on, because
 * its placeholders have nothing to put in there yet, e.g. {author} with no
 * author set (see emptyBandNotice)
 * @param page the page, counted from 1, or null for the first
 */
const tellIfEmpty = (view: EditorView, band: Band, edited: number | null) => {
  const { doc } = view.state;
  const { layout } = resolveLayout(
    frontmatterOf(doc),
    config.value.layout.page,
  );
  const fields = documentFields(doc, path.value);
  const page = edited ?? 1;
  const pages = pageLayoutState.value?.pages ?? 1;
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
 * @param page the page whose band to edit, counted from 1: the page in view
 *   unless given, none without pages
 */
export const openBand = (view: EditorView, band: Band, page?: number) => {
  // a click outside an open strip closes it first, keeping its text
  if (bandEditor.value !== null) return;
  const locale = systemLocale();
  const defaults = config.value.layout.page;
  const { settings } = resolveLayout(
    frontmatterOf(view.state.doc),
    defaults,
    locale,
  );
  const inView = pageInView();
  const edited = page ?? (inView === null ? null : inView + 1);
  bandEditor.value = {
    band,
    page: edited,
    bands: bandSettings(settings),
    apply: (bands) => {
      const chosen = { ...settings, ...bands };
      writePage(
        view,
        changesOf(settings, chosen, defaults, locale),
        localeUnit(locale),
      );
      view.focus();
      tellIfEmpty(view, band, edited);
    },
  };
};

/**
 * editBand opens the strip of the header or footer, see openBand
 * @param page the page whose band to edit, counted from 1
 */
export const editBand =
  (band: Band, page?: number): Command =>
  (_state, dispatch, view) => {
    if (dispatch && view) openBand(view, band, page);
    return true;
  };
