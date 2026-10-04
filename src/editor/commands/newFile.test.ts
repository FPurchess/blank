import { beforeEach, describe, expect, it } from "vitest";

import { schema } from "../../markdown";
import { importedFrom, path } from "../../state";
import {
  createState,
  createTestView,
  doc,
  docWithFrontmatter,
  h,
  p,
} from "../../test/editor";
import newFile from "./newFile";

describe("command.newFile", () => {
  beforeEach(() => {
    path.value = "/notes.md";
    importedFrom.value = "/report.docx";
  });

  it("empties the document and forgets its path", () => {
    const view = createTestView(createState(doc(h(1, "Title"), p("text"))));

    expect(newFile()(view.state, view.dispatch)).toBe(true);

    expect(view.state.doc.textContent).toBe("");
    expect(view.state.doc.childCount).toBe(1);
    expect(path.value).toBeNull();
    expect(importedFrom.value).toBeNull();
  });

  it("forgets the frontmatter of the old document", () => {
    const view = createTestView(
      createState(docWithFrontmatter("title: Old", p("text"))),
    );

    newFile()(view.state, view.dispatch);

    expect(view.state.doc.attrs.frontmatter).toBeNull();
  });

  it("forgets the definitions of the old document's forms", () => {
    const old = schema.nodes.doc.create(
      { definitions: { "user/a@1#00000000": {} }, rawDefinitions: ["a: 1"] },
      schema.node("paragraph"),
    );
    const view = createTestView(createState(old));

    newFile()(view.state, view.dispatch);

    expect(view.state.doc.attrs.rawDefinitions).toEqual([]);
    expect(view.state.doc.attrs.definitions).toEqual({});
  });

  it("changes nothing without dispatch", () => {
    const state = createState(doc(p("text")));

    expect(newFile()(state)).toBe(false);

    expect(path.value).toBe("/notes.md");
  });
});
