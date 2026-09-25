import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";

import { transaction } from "../state";
import { mockCliArgs } from "../test/tauri";
import { bootEditor } from ".";

const editor = () => document.querySelector<HTMLElement>(".ProseMirror");

describe("bootEditor", () => {
  beforeEach(async () => {
    await localforage.clear();
    mockCliArgs();
    transaction.value = null;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await bootEditor();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the editor with the welcome document", () => {
    expect(editor()?.textContent).toContain("Welcome to Blank");
    expect(transaction.value?.doc.textContent).toContain("Welcome to Blank");
  });

  it("focuses the editor shortly after booting", () => {
    expect(document.activeElement).not.toBe(editor());

    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(editor());
  });

  it("takes the focus back when the editor loses it", () => {
    vi.advanceTimersByTime(100);

    editor()?.blur();
    expect(document.activeElement).not.toBe(editor());

    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(editor());
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
