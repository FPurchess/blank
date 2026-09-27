import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { doc, docWithFrontmatter, p } from "../../test/editor";
import properties, { PROPERTIES_CLASS, summarize } from "./properties";

describe("summarize", () => {
  it.each([
    ["title: The Lighthouse\nauthor: Ada", "The Lighthouse · by Ada"],
    [
      "title: The Lighthouse\ntags: [a]\naliases: [b]",
      "The Lighthouse · tags, aliases",
    ],
    ["a: 1\nb: 2\nc: 3\nd: 4", "4 properties"],
    ["title: Hi\na: 1\nb: 2\nc: 3\nd: 4", "Hi · 4 more properties"],
    ["title: ''\ntags: [a]", "title, tags"],
    ["title: [unclosed", "Properties that can't be read"],
    ["- a list", "Properties that can't be read"],
  ])("sums up %j", (frontmatter, summary) => {
    expect(summarize(frontmatter)).toBe(summary);
  });

  it.each([null, "", "  \n", "# only a comment"])(
    "shows nothing for %j",
    (frontmatter) => {
      expect(summarize(frontmatter)).toBeNull();
    },
  );
});

describe("plugins.properties", () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  const mount = (node: ReturnType<typeof doc>) => {
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ doc: node, plugins: [properties()] }),
    });
    return view;
  };

  const summaries = (editor: EditorView) =>
    [...editor.dom.querySelectorAll(`.${PROPERTIES_CLASS}`)].map(
      (element) => element.textContent,
    );

  it("shows the summary above the text, where it can't be edited", () => {
    const editor = mount(docWithFrontmatter("title: Hi", p("text")));

    const summary = editor.dom.firstElementChild as HTMLElement;
    expect(summary.classList).toContain(PROPERTIES_CLASS);
    expect(summary.textContent).toBe("Hi");
    expect(summary.contentEditable).toBe("false");
    expect(editor.state.doc.textContent).toBe("text");
  });

  it("shows nothing without frontmatter", () => {
    expect(summaries(mount(doc(p("text"))))).toEqual([]);
  });

  it("follows changes to the frontmatter and keeps it while typing", () => {
    const editor = mount(docWithFrontmatter("title: Hi", p("text")));

    editor.dispatch(editor.state.tr.insertText("more ", 1));
    expect(summaries(editor)).toEqual(["Hi"]);

    editor.dispatch(
      editor.state.tr.setDocAttribute("frontmatter", "title: Bye"),
    );
    expect(summaries(editor)).toEqual(["Bye"]);

    editor.dispatch(editor.state.tr.setDocAttribute("frontmatter", null));
    expect(summaries(editor)).toEqual([]);
  });
});
