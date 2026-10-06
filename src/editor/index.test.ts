import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import {
  imageDialog,
  type ImageDialogRequest,
  linkDialog,
  type LinkDialogRequest,
  pageSetup,
  transaction,
} from "../state";
import { bootEditor } from ".";
import { pageSetup as openPageSetup } from "./commands";
import type { EditorHandle } from "./handle";

const editor = () => document.querySelector<HTMLElement>("#editor");

describe("bootEditor", () => {
  let handle: EditorHandle;

  beforeEach(async () => {
    await localforage.clear();
    transaction.value = null;
    linkDialog.value = null;
    imageDialog.value = null;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    handle = await bootEditor();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns a handle that follows the editor", () => {
    const { view } = handle;
    expect(view.dom).toBe(editor());

    handle.run((state, dispatch) => {
      dispatch?.(state.tr.insertText("hello ", 1));
      return true;
    });

    expect(handle.state.value).toBe(view.state);
    expect(handle.state.value.doc.textContent).toMatch(/^hello /);
  });

  it("keeps the handle's state when a new document is opened", () => {
    const next = EditorState.create({
      schema: handle.view.state.schema,
      plugins: handle.view.state.plugins,
    });
    handle.view.updateState(next);

    expect(handle.state.value).toBe(next);
  });

  it("mounts the editor with the welcome document", () => {
    expect(editor()?.classList).toContain("ProseMirror");
    expect(editor()?.textContent).toContain("Welcome to Blank");
    expect(transaction.value?.doc.textContent).toContain("Welcome to Blank");
  });

  it("focuses the editor shortly after booting", () => {
    expect(document.activeElement).not.toBe(editor());

    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(editor());
  });

  it("leaves the cursor where a click right after booting put it", () => {
    // focusing writes the editor's selection to the DOM, which would undo a
    // click the editor hasn't read yet
    vi.spyOn(EditorView.prototype, "hasFocus").mockReturnValue(true);
    const focus = vi.spyOn(EditorView.prototype, "focus");

    vi.advanceTimersByTime(100);

    expect(focus).not.toHaveBeenCalled();
  });

  it("takes the focus back when the editor loses it", () => {
    vi.advanceTimersByTime(100);

    editor()?.blur();
    expect(document.activeElement).not.toBe(editor());

    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(editor());
  });

  it("leaves the focus to the link dialog while it is open", () => {
    vi.advanceTimersByTime(100);
    linkDialog.value = {} as LinkDialogRequest;

    editor()?.blur();
    vi.advanceTimersByTime(100);
    expect(document.activeElement).not.toBe(editor());

    linkDialog.value = null;
    editor()?.blur();
    vi.advanceTimersByTime(100);
    expect(document.activeElement).not.toBe(editor());
  });

  it("leaves the focus to the image dialog while it is open", () => {
    vi.advanceTimersByTime(100);
    imageDialog.value = {} as ImageDialogRequest;

    editor()?.blur();
    vi.advanceTimersByTime(100);
    expect(document.activeElement).not.toBe(editor());
  });

  it("does not take the focus back once the link dialog opened", () => {
    vi.advanceTimersByTime(100);

    editor()?.blur();
    linkDialog.value = {} as LinkDialogRequest;
    vi.advanceTimersByTime(100);

    expect(document.activeElement).not.toBe(editor());
  });

  it("opens the page setup for its document through its handle, e.g. from the bottom bar", () => {
    pageSetup.value = null;

    handle.run(openPageSetup());

    // the welcome document has no frontmatter, so nothing of its own
    expect(pageSetup.value).toMatchObject({ readable: true, warnings: [] });
    pageSetup.value = null;
  });

  it("publishes every transaction", () => {
    const initial = transaction.value;

    editor()?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(transaction.value).not.toBe(initial);
    expect(transaction.value?.docChanged).toBe(true);
  });
});

describe("the editor's first focus", () => {
  beforeEach(async () => {
    await localforage.clear();
    transaction.value = null;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("leaves an editor that's gone by then", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { view } = await bootEditor();
    const focus = vi.spyOn(view, "focus");
    view.dom.remove();
    vi.advanceTimersByTime(100);
    expect(focus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
