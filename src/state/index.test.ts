import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";

import { schema } from "../markdown";
import {
  announce,
  announcement,
  bootState,
  textContent,
  theme,
  transaction,
} from ".";

describe("bootState", () => {
  afterEach(() => {
    vi.useRealTimers();
    theme.value = "light";
    transaction.value = null;
    announcement.value = null;
    textContent.value = "";
  });

  it("applies the theme, follows the text and clears messages until disposed", () => {
    vi.useFakeTimers();
    const dispose = bootState();
    theme.value = "dark";
    const state = EditorState.create({ schema });
    transaction.value = state.tr.insertText("hello");
    announce("A row added");
    vi.runAllTimers();

    expect(document.body.dataset.theme).toBe("dark");
    expect(textContent.value).toBe("hello");
    expect(announcement.value).toBeNull();

    dispose();
    theme.value = "red";
    transaction.value = state.tr.insertText("bye");
    announce("A row added");
    vi.runAllTimers();
    expect(document.body.dataset.theme).toBe("dark");
    expect(textContent.value).toBe("hello");
    expect(announcement.value?.text).toBe("A row added");
  });
});
