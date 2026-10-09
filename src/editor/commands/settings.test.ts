import { afterEach, describe, expect, it, vi } from "vitest";

import { openUrl } from "@tauri-apps/plugin-opener";

import { GUIDE } from "../../links";
import {
  focusMode,
  setFocusMode,
  settingsDialog,
  settingsSection,
} from "../../state";
import { createState, doc, p } from "../../test/editor";
import { toggleFocusMode } from "./focusMode";
import { openGuide } from "./guide";
import { openSettings } from "./settings";

describe("the settings and focus mode commands", () => {
  const state = createState(doc(p("text")));
  afterEach(() => {
    settingsDialog.value = null;
    settingsSection.value = "appearance";
    setFocusMode(false);
  });

  it("open the settings, and only ask without dispatch", () => {
    expect(openSettings()(state)).toBe(true);
    expect(settingsDialog.value).toBeNull();

    openSettings()(state, () => {});
    expect(settingsDialog.value).toEqual({});
  });

  it("open the settings on a section, e.g. the shortcuts or About", () => {
    settingsSection.value = "writing";
    openSettings("shortcuts")(state);
    expect(settingsSection.value).toBe("writing");

    openSettings("shortcuts")(state, () => {});
    expect(settingsSection.value).toBe("shortcuts");
    expect(settingsDialog.value).toEqual({});
    // the open dialog stays as it is
    openSettings("about")(state, () => {});
    expect(settingsSection.value).toBe("shortcuts");
  });

  it("open the guide in the browser", async () => {
    expect(openGuide()(state)).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();

    openGuide()(state, () => {});
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith(GUIDE));
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
