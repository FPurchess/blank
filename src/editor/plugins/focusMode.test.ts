import { afterEach, describe, expect, it } from "vitest";

import { focusMode, languagePicker, setFocusMode } from "../../state";
import { closePicker, openPicker } from "../../languagePicker";
import {
  createState,
  createTestView,
  doc,
  p,
  pressKey,
} from "../../test/editor";
import { focusModeKeys } from "./focusMode";

describe("plugin.focusModeKeys", () => {
  const press = (key: string) => {
    const plugin = focusModeKeys();
    const view = createTestView(
      createState(doc(p("text")), { plugins: [plugin] }),
    );
    return pressKey(view, plugin, key);
  };

  afterEach(() => {
    setFocusMode(false);
    closePicker();
  });

  it("leaves focus mode on Esc in the text", () => {
    setFocusMode(true);

    expect(press("Escape")).toBe(true);
    expect(focusMode.value).toBe(false);
  });

  it("leaves Esc alone outside focus mode or while something is open", () => {
    expect(press("Escape")).toBe(false);

    setFocusMode(true);
    openPicker();
    expect(languagePicker.value.open).toBe(true);
    expect(press("Escape")).toBe(false);
    expect(focusMode.value).toBe(true);
  });

  it("takes no other key", () => {
    setFocusMode(true);
    expect(press("a")).toBe(false);
  });
});
