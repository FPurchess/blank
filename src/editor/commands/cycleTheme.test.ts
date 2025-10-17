import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";

import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";

import { cycleTheme } from ".";
import { theme, themes } from "../../state";

describe("command.cycleTheme", () => {
  beforeEach(() => {
    mockWindows("main");
    theme.value = themes[0];
  });

  afterEach(() => {
    clearMocks();
  });

  it("cycles", () => {
    expect(window).toBeDefined();

    const bodyTheme = () => document.body.dataset.theme;

    themes.forEach((currentTheme, index) => {
      assert.equal(theme.value, currentTheme);
      assert.equal(bodyTheme(), currentTheme);

      cycleTheme()(new EditorState());

      const nextTheme = themes[(index + 1) % themes.length];
      assert.equal(theme.value, nextTheme);
      assert.equal(bodyTheme(), nextTheme);
    });
  });
});
