import { beforeEach, describe, expect, it } from "vitest";

import { uiRoot } from "./uiRoot";

describe("uiRoot", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("creates the root after what the body holds, e.g. the editor", () => {
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    document.body.append(editor);

    const root = uiRoot();

    expect(root.id).toBe("ui");
    expect(editor.nextElementSibling).toBe(root);
  });

  it("returns the same root every time", () => {
    expect(uiRoot()).toBe(uiRoot());
    expect(document.querySelectorAll("#ui")).toHaveLength(1);
  });
});
