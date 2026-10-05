import { describe, expect, it } from "vitest";

import {
  firstHeadings,
  languageLabel,
  optionLabel,
  pageMenuItems,
  pickerWindow,
  spellcheckLabel,
  viewLabel,
} from "./statusBarModel";

describe("spellcheckLabel", () => {
  it("shows a message instead of the status", () => {
    expect(spellcheckLabel({ state: "ready", tag: "de" }, "Done")).toEqual({
      text: "Done",
      tip: undefined,
    });
  });

  it("says whether it's on, and leaves the tooltip to the command", () => {
    expect(spellcheckLabel({ state: "ready", tag: "de" }, null)).toEqual({
      text: "Spelling",
      tip: undefined,
    });
    expect(spellcheckLabel({ state: "off", tag: "de" }, null)).toEqual({
      text: "Spelling off",
      tip: undefined,
    });
  });

  it("names what happens to the dictionary while it isn't ready", () => {
    expect(spellcheckLabel({ state: "loading", tag: "de" }, null).tip).toBe(
      "Spelling: loading German",
    );
    expect(spellcheckLabel({ state: "unavailable", tag: "de" }, null).tip).toBe(
      "Spelling: no German dictionary",
    );
    expect(
      spellcheckLabel({ state: "error", tag: "de", message: "Broken" }, null),
    ).toEqual({ text: "Spelling failed", tip: "Spelling: Broken" });
    expect(
      spellcheckLabel({ state: "error", tag: "de" }, null).tip,
    ).toBeUndefined();
  });
});

describe("viewLabel", () => {
  it("names the view shown and what a click does", () => {
    expect(viewLabel("pages")).toEqual({
      tip: "View: pages",
      aria: "View: pages. Switch to page ends",
    });
    expect(viewLabel("page-ends")).toEqual({
      tip: "View: page ends",
      aria: "View: page ends. Switch to pages",
    });
  });
});

describe("firstHeadings", () => {
  const heading = (text: string, pos: number) => ({ level: 1, text, pos });
  // the headings at 0 and 10 are on the first page, 20 on the third
  const pageOf = (pos: number) =>
    pos < 15 ? 0 : pos === 30 ? null : pos === 40 ? 9 : 2;

  it("finds the first heading with text on each page", () => {
    expect(
      firstHeadings(
        3,
        [
          heading("", 0),
          heading("One", 5),
          heading("Two", 10),
          heading("Three", 20),
        ],
        pageOf,
      ),
    ).toEqual(["One", "", "Three"]);
  });

  it("skips headings that aren't laid out or are past the pages", () => {
    expect(
      firstHeadings(2, [heading("Gone", 30), heading("Far", 40)], pageOf),
    ).toEqual(["", ""]);
  });
});

describe("pageMenuItems", () => {
  it("lists the pages with their headings, going to the one chosen", () => {
    const went: number[] = [];
    const items = pageMenuItems(["Intro", ""], (page) => went.push(page));
    expect(items).toMatchObject([
      { id: "page:1", label: "Page 1", icon: "page", detail: "Intro" },
      { id: "page:2", label: "Page 2", icon: "page" },
    ]);
    expect(items[1]).not.toHaveProperty("detail");
    const second = items[1];
    if (second !== "separator") second.run?.();
    expect(went).toEqual([2]);
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
