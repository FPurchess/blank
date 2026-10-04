import { Plugin } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { frontmatterOf, propertiesOf, readFrontmatter } from "../../markdown";
import { openPageSetup } from "../commands/pageSetup";

// Shows a quiet line above the text of a document that has frontmatter, so
// the properties Blank keeps for it (see src/markdown/frontmatter.ts) aren't
// hidden: e.g. "The Lighthouse · by Ada · tags". Clicking it opens the page
// setup, where "Edit as Text" shows them all.

export const PROPERTIES_CLASS = "doc-properties";

// the keys summed up by name, before they are only counted
const MAX_NAMED_KEYS = 3;

/**
 * summarize describes the frontmatter in a few words
 * @param frontmatter the frontmatter of the document
 * @returns the summary, or null if there is nothing to show
 */
export const summarize = (frontmatter: string | null): string | null => {
  const data = readFrontmatter(frontmatter);
  if (data === undefined) return "Properties that can't be read";

  const { title, author } = propertiesOf(data);
  // the page setup stays out of the way of the text: the bottom bar shows
  // the paper, and the page setup the rest
  const others = Object.keys(data).filter(
    (key) =>
      key !== "page" &&
      !(key === "title" && title) &&
      !(key === "author" && author),
  );
  const parts = [
    ...(title ? [title] : []),
    ...(author ? [`by ${author}`] : []),
  ];
  if (others.length > MAX_NAMED_KEYS) {
    parts.push(`${others.length} ${parts.length ? "more " : ""}properties`);
  } else if (others.length) {
    parts.push(others.join(", "));
  }
  return parts.length ? parts.join(" · ") : null;
};

const render = (summary: string) => (view: EditorView) => {
  const element = document.createElement("div");
  element.className = PROPERTIES_CLASS;
  element.contentEditable = "false";
  element.setAttribute("role", "note");
  element.title =
    "Properties from the top of the file, kept when you save. Click for the page setup";
  element.textContent = summary;
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
    openPageSetup(view);
  });
  return element;
};

const decorate = (doc: Node) => {
  const summary = summarize(frontmatterOf(doc));
  if (summary === null) return DecorationSet.empty;
  return DecorationSet.create(doc, [
    Decoration.widget(0, render(summary), {
      side: -1,
      ignoreSelection: true,
      key: `properties:${summary}`,
    }),
  ]);
};

export default () =>
  new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, decorations, before) =>
        tr.doc.attrs.frontmatter === before.doc.attrs.frontmatter
          ? decorations.map(tr.mapping, tr.doc)
          : decorate(tr.doc),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
