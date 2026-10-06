import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { config } from "../../config";
import { changesOf } from "../../layout/choices";
import { localeUnit, systemLocale } from "../../layout/paper";
import { resolveLayout } from "../../layout/resolve";
import {
  type PageChanges,
  type PageSettings,
  writePageSettings,
} from "../../layout/settings";
import type { Unit } from "../../layout/units";
import {
  frontmatterOf,
  readFrontmatter,
  updateFrontmatter,
} from "../../markdown";

/**
 * frontmatterTr returns the transaction that replaces the frontmatter of the
 * document, or null when nothing changes
 */
const frontmatterTr = (
  state: EditorState,
  next: string | null,
): Transaction | null =>
  next === state.doc.attrs.frontmatter
    ? null
    : state.tr.setDocAttribute("frontmatter", next);

/**
 * pageTr returns the transaction that writes page settings into the
 * frontmatter of the document (see writePageSettings), or null when nothing
 * changes
 * @param unit the unit to write new lengths in
 */
export const pageTr = (state: EditorState, changes: PageChanges, unit: Unit) =>
  frontmatterTr(
    state,
    updateFrontmatter(frontmatterOf(state.doc), (document) =>
      writePageSettings(document, changes, unit),
    ),
  );

/**
 * writePage writes page settings into the frontmatter of the document as one
 * undo step, see writePageSettings
 * @param unit the unit to write new lengths in
 */
export const writePage = (
  view: EditorView,
  changes: PageChanges,
  unit: Unit,
) => {
  const tr = pageTr(view.state, changes, unit);
  if (tr) view.dispatch(tr);
};

/**
 * pageEdit starts a change of the page settings of the document of `view`,
 * as the page setup and the header and footer strip make one: the settings
 * as they are, over the user's defaults, whether the frontmatter can be read
 * to write them into, and `write`, which writes the settings chosen as one
 * undo step, only what changed and nothing that is back to the default
 */
export const pageEdit = (view: EditorView) => {
  const locale = systemLocale();
  const unit = localeUnit(locale);
  const defaults = config.value.layout.page;
  const frontmatter = frontmatterOf(view.state.doc);
  const { settings, problems } = resolveLayout(frontmatter, defaults, locale);
  return {
    locale,
    unit,
    defaults,
    settings,
    problems,
    readable: readFrontmatter(frontmatter) !== undefined,
    write: (chosen: PageSettings) =>
      writePage(view, changesOf(settings, chosen, defaults, locale), unit),
  };
};
