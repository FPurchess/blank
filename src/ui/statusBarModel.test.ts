import { describe, expect, it } from "vitest";

import {
  countOf,
  languageLabel,
  optionLabel,
  pickerWindow,
  spellcheckLabel,
  titleOf,
} from "./statusBarModel";

describe("titleOf", () => {
  it("names the file, an imported Word document, or Untitled", () => {
    expect(titleOf("/docs/a.md", "/docs/a.docx")).toBe("» /docs/a.md");
    expect(titleOf(null, "/docs/a.docx")).toBe("» a.docx (imported)");
    expect(titleOf(null, null)).toBe("» Untitled");
  });
});

describe("countOf", () => {
  it("counts words and chars, none in an empty document", () => {
    expect(countOf("")).toBe("0 words 0 chars");
    expect(countOf("one two")).toBe("2 words 7 chars");
  });

  it("counts words separated by a line break or a tab", () => {
    expect(countOf("one\ntwo\tthree")).toBe("3 words 13 chars");
  });
});

describe("spellcheckLabel", () => {
  it("shows a message instead of the status, without a tooltip", () => {
    expect(spellcheckLabel({ state: "ready", tag: "de" }, "Done")).toEqual({
      text: "Done",
      title: "",
    });
  });

  it("says how to turn it off, and nothing while it's off", () => {
    expect(spellcheckLabel({ state: "ready", tag: "de" }, null)).toEqual({
      text: "Spelling",
      title: "Checking German spelling, click to turn spell check off",
    });
    expect(spellcheckLabel({ state: "off", tag: "de" }, null)).toEqual({
      text: "",
      title: "",
    });
  });
});

describe("spellcheckLabel while downloading", () => {
  it("rounds the progress to the nearest percent", () => {
    const label = spellcheckLabel(
      { state: "downloading", tag: "de", progress: 0.426 },
      null,
    );
    expect(label.text).toBe("Spelling 43 %");
  });
});

describe("language labels", () => {
  it("mark a language that uses the English rules", () => {
    expect(optionLabel("de-CH")).toBe("de-CH");
    expect(optionLabel("tr")).toBe("tr*");
    expect(languageLabel("de-CH")).toBe("DE-CH");
    expect(languageLabel("tr")).toBe("TR*");
  });
});

describe("pickerWindow", () => {
  const languages = ["a", "b", "c", "d", "e", "f", "g"];

  it("shows five languages with the selected one in the middle", () => {
    expect(pickerWindow(languages, "d")).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("wraps around the ends of the list", () => {
    expect(pickerWindow(languages, "a")).toEqual(["f", "g", "a", "b", "c"]);
    expect(pickerWindow(languages, "g")).toEqual(["e", "f", "g", "a", "b"]);
  });

  it("shows each language once when there are fewer", () => {
    expect(pickerWindow(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
  });
});
