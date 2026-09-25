import { beforeEach, describe, expect, it } from "vitest";

import { path } from "../../state";
import { createState, createTestView, doc, h, p } from "../../test/editor";
import newFile from "./newFile";

describe("command.newFile", () => {
  beforeEach(() => {
    path.value = "/notes.md";
  });

  it("empties the document and forgets its path", () => {
    const view = createTestView(createState(doc(h(1, "Title"), p("text"))));

    expect(newFile()(view.state, view.dispatch)).toBe(true);

    expect(view.state.doc.textContent).toBe("");
    expect(view.state.doc.childCount).toBe(1);
    expect(path.value).toBeNull();
  });

  it("changes nothing without dispatch", () => {
    const state = createState(doc(p("text")));

    expect(newFile()(state)).toBe(false);

    expect(path.value).toBe("/notes.md");
  });
});
