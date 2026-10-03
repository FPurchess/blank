import { describe, expect, it } from "vitest";

import { testEngine } from "../test/engine";
import { FONT_FILES, FONT_URLS } from "./fonts";

// The engine numbers fonts by their place in this list, and its tests and
// tools load the same files from disk (FONT_FILES in
// src-tauri/layout/src/fonts.rs), so both lists must match, in order.

describe("Blank's fonts", () => {
  it("are the engine's, in its order", () => {
    expect(FONT_FILES).toEqual(testEngine().raw.bundledFontFiles());
  });

  it("are loaded from the files they are named by", () => {
    expect(FONT_URLS).toHaveLength(FONT_FILES.length);
    FONT_URLS.forEach((url, index) =>
      expect(decodeURIComponent(url)).toMatch(
        new RegExp(`/${FONT_FILES[index].replaceAll(".", "\\.")}$`),
      ),
    );
  });
});
