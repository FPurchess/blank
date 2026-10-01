import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";

import { NO_SLOTS } from "../../layout/settings";
import { announcement, bandEditor } from "../../state";
import { doc, docWithFrontmatter, h, p } from "../../test/editor";
import { editBand, openBand } from "./editBand";

let view: EditorView;

const mount = (node: ReturnType<typeof doc>) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc: node, plugins: [history()] }),
  });
  return view;
};

const request = () => {
  const value = bandEditor.value;
  if (!value) throw new Error("no strip is open");
  bandEditor.value = null;
  return value;
};

const frontmatter = () => view.state.doc.attrs.frontmatter;

describe("command.editBand", () => {
  afterEach(() => {
    view?.destroy();
    bandEditor.value = null;
    announcement.value = null;
  });

  it("opens the strip with the band as the document has it", () => {
    mount(
      docWithFrontmatter(
        'title: Hi\npage:\n  header: { left: "{title}" }\n  first-page: plain',
        h(1, "Report"),
      ),
    );

    expect(editBand("header")(view.state, view.dispatch, view)).toBe(true);

    expect(request()).toMatchObject({
      band: "header",
      bands: {
        header: { ...NO_SLOTS, left: "{title}" },
        firstPage: "plain",
      },
      fields: { title: "Hi", author: "", file: "" },
    });
  });

  it("does nothing without a view", () => {
    mount(doc(p("text")));
    expect(editBand("footer")(view.state)).toBe(true);
    expect(bandEditor.value).toBeNull();
  });

  it("doesn't open a second strip over an open one", () => {
    mount(doc(p("text")));
    openBand(view, "header");
    const first = bandEditor.value;

    openBand(view, "footer");

    expect(bandEditor.value).toBe(first);
  });

  it("writes the band and first page as one undo step", () => {
    mount(docWithFrontmatter("title: Hi", p("text")));
    openBand(view, "footer");

    const strip = request();
    strip.apply({
      ...strip.bands,
      footer: { ...NO_SLOTS, center: "{page}" },
      firstPage: "plain",
    });

    expect(frontmatter()).toBe(
      'title: Hi\npage:\n  footer: {center: "{page}"}\n  first-page: plain',
    );
    undo(view.state, view.dispatch);
    expect(frontmatter()).toBe("title: Hi");
  });

  it("removes a band that is emptied, and the frontmatter with it", () => {
    mount(docWithFrontmatter('page:\n  header: { left: "x" }', p("text")));
    openBand(view, "header");

    const strip = request();
    strip.apply({ ...strip.bands, header: NO_SLOTS });

    expect(frontmatter()).toBeNull();
  });

  it("changes nothing when nothing changed", () => {
    mount(doc(p("text")));
    openBand(view, "header");
    const before = view.state;

    const strip = request();
    strip.apply(strip.bands);

    expect(view.state).toBe(before);
  });

  it("tells when the band comes out empty on the page, and why", () => {
    mount(docWithFrontmatter("title: Hi", p("text")));
    openBand(view, "header");
    const strip = request();
    strip.apply({
      ...strip.bands,
      header: { ...NO_SLOTS, left: "{author}", right: "{chapter}" },
    });
    expect(announcement.value?.text).toMatch(
      /^The header is empty on this page: no author is set and the document has no chapter heading yet\. Add an author under Edit as Text in Page Setup \(.+\)\.$/,
    );
  });

  it("tells nothing when the band shows something", () => {
    mount(docWithFrontmatter("author: Ada", h(1, "One"), p("text")));
    openBand(view, "footer");
    const strip = request();
    strip.apply({
      ...strip.bands,
      footer: { ...NO_SLOTS, left: "{author}", right: "{chapter}" },
    });
    expect(announcement.value).toBeNull();
    // nor when a placeholder is empty beside text
    openBand(view, "header");
    const header = request();
    header.apply({
      ...header.bands,
      header: { ...NO_SLOTS, left: "by {file}" },
    });
    expect(announcement.value).toBeNull();
  });
});
