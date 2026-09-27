import { describe, expect, it } from "vitest";

import {
  differences,
  layoutOf,
  leavesRoom,
  pageGeometry,
  resolveLayout,
} from "./resolve";
import { allMargins, DEFAULT_PAGE, type PageSettings } from "./settings";
import { cm } from "../test/layout";

describe("resolveLayout", () => {
  it("lays a document without settings out on the paper of the region", () => {
    expect(resolveLayout(null, DEFAULT_PAGE, "de-DE")).toEqual({
      layout: {
        paper: { name: "a4", auto: true, width: 595.28, height: 841.89 },
        orientation: "portrait",
        margins: allMargins(cm(2.5)),
      },
      settings: DEFAULT_PAGE,
      problems: [],
    });
    expect(resolveLayout(null, DEFAULT_PAGE, "en-US").layout.paper).toEqual({
      name: "letter",
      auto: true,
      width: 612,
      height: 792,
    });
  });

  it("takes the document's settings over the user's defaults", () => {
    const defaults: PageSettings = {
      ...DEFAULT_PAGE,
      size: "a5",
      margins: allMargins(cm(2)),
    };

    const { layout, problems } = resolveLayout(
      "page:\n  orientation: landscape\n  margins: { top: 3cm }",
      defaults,
      "de-DE",
    );

    expect(layout.paper).toMatchObject({ name: "a5", auto: false });
    expect(layout.orientation).toBe("landscape");
    expect(layout.margins).toEqual({ ...allMargins(cm(2)), top: cm(3) });
    expect(problems).toEqual([]);
  });

  it("names a custom size that is known paper", () => {
    const { layout } = resolveLayout(
      "page:\n  size: 210mm x 297mm",
      DEFAULT_PAGE,
      "en-US",
    );
    expect(layout.paper).toMatchObject({ name: "a4", auto: false });
  });

  it("reports what it can't use and keeps the defaults for it", () => {
    const { settings, problems } = resolveLayout(
      "page:\n  size: a2\n  orientation: landscape",
      DEFAULT_PAGE,
    );
    expect(settings).toEqual({ ...DEFAULT_PAGE, orientation: "landscape" });
    expect(problems).toEqual(["page.size"]);
  });

  it("reports frontmatter it can't read", () => {
    const { settings, problems } = resolveLayout("page: [a", DEFAULT_PAGE);
    expect(settings).toEqual(DEFAULT_PAGE);
    expect(problems).toEqual(["frontmatter"]);
  });

  it("refuses margins that leave no room for the text", () => {
    const { settings, problems } = resolveLayout(
      "page:\n  size: a5\n  margins: { left: 7cm, right: 7cm }",
      DEFAULT_PAGE,
    );
    expect(settings.margins).toEqual(DEFAULT_PAGE.margins);
    expect(problems).toEqual(["page.margins"]);
  });
});

describe("pageGeometry", () => {
  it("turns the page for landscape and leaves the margins for the text", () => {
    const layout = layoutOf(
      {
        size: "a4",
        orientation: "landscape",
        margins: { top: 10, right: 20, bottom: 30, left: 40 },
      },
      "de-DE",
    );

    expect(pageGeometry(layout)).toEqual({
      width: 841.89,
      height: 595.28,
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
      contentWidth: 841.89 - 60,
      contentHeight: 595.28 - 40,
    });
  });
});

describe("leavesRoom", () => {
  it("wants 2.5 cm for the text both ways", () => {
    const a5 = (left: number) =>
      layoutOf(
        { ...DEFAULT_PAGE, size: "a5", margins: { ...allMargins(0), left } },
        "de-DE",
      );
    // A5 is 14.8 cm wide
    expect(leavesRoom(a5(cm(12.3)))).toBe(true);
    expect(leavesRoom(a5(cm(12.4)))).toBe(false);
  });
});

describe("differences", () => {
  it("compares paper by its size", () => {
    expect(
      differences(DEFAULT_PAGE, { ...DEFAULT_PAGE, size: "a4" }, "de-DE"),
    ).toEqual([]);
    expect(
      differences(DEFAULT_PAGE, { ...DEFAULT_PAGE, size: "a4" }, "en-US"),
    ).toEqual(["size"]);
  });

  it("lists every setting that differs", () => {
    expect(
      differences(
        DEFAULT_PAGE,
        { size: "a5", orientation: "landscape", margins: allMargins(72) },
        "de-DE",
      ),
    ).toEqual(["size", "orientation", "margins"]);
  });
});
