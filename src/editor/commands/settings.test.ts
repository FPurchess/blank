import { afterEach, describe, expect, it } from "vitest";

import { focusMode, setFocusMode, settingsDialog } from "../../state";
import { createState, doc, p } from "../../test/editor";
import { toggleFocusMode } from "./focusMode";
import { openSettings } from "./settings";

describe("the settings and focus mode commands", () => {
  const state = createState(doc(p("text")));
  afterEach(() => {
    settingsDialog.value = null;
    setFocusMode(false);
  });

  it("open the settings, and only ask without dispatch", () => {
    expect(openSettings()(state)).toBe(true);
    expect(settingsDialog.value).toBeNull();

    openSettings()(state, () => {});
    expect(settingsDialog.value).toEqual({});
  });

  it("turn focus mode on and off", () => {
    expect(toggleFocusMode()(state)).toBe(true);
    expect(focusMode.value).toBe(false);

    toggleFocusMode()(state, () => {});
    expect(focusMode.value).toBe(true);
    toggleFocusMode()(state, () => {});
    expect(focusMode.value).toBe(false);
  });
});
