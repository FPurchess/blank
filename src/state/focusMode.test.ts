import { afterEach, describe, expect, it } from "vitest";

import {
  announcement,
  controlsFaded,
  focusMode,
  focusModeMessage,
  setFocusMode,
} from ".";

describe("focus mode", () => {
  afterEach(() => setFocusMode(false));

  it("says how the controls fade, also without a rest time", () => {
    expect(focusModeMessage(10)).toContain("when you type or after 10 s");
    expect(focusModeMessage(0)).toBe(
      "Focus mode: the controls fade when you type; move the mouse to bring them back",
    );
  });

  it("brings the controls back when it ends", () => {
    setFocusMode(true);
    controlsFaded.value = true;

    setFocusMode(false);

    expect(focusMode.value).toBe(false);
    expect(controlsFaded.value).toBe(false);
    expect(announcement.value?.text).toBe("Focus mode off");
  });
});
