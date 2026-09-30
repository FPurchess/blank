import { describe, expect, it } from "vitest";

import { schema } from "../markdown";
import { doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { bandsOn, documentFields, fieldValues } from "./bands";
import type { Layout } from "./resolve";
import { SLOTS } from "./settings";
import { expand } from "./tokens";

// The headers and footers are expanded twice: by the layout engine for the
// pages and the PDF (src-tauri/layout/src/bands.rs), and here for the Word
// export and the thumbnails. Both must give the same text on every page.

const pageBreak = () => schema.node("page_break");

// three pages, each starting with a heading 1, so {chapter} is known
const chapters = ["One", "Two", "Three"];
const node = doc(
  h(1, chapters[0]),
  p("text"),
  pageBreak(),
  h(1, chapters[1]),
  p("text"),
  pageBreak(),
  h(1, chapters[2]),
  p("text"),
);

const slots = (left: string, center: string, right: string) => ({
  left,
  center,
  right,
});

const layouts: [string, Partial<Layout>][] = [
  ["numbers", {}],
  ["roman numbers from 5", { numberStyle: "i", startNumber: 5 }],
  ["capital roman numbers", { numberStyle: "I" }],
  ["a plain first page", { firstPage: "plain" }],
  [
    "a first page of its own",
    {
      firstPage: {
        header: slots("", "{title}", ""),
        footer: slots("", "", ""),
      },
    },
  ],
  [
    "even pages of their own, by the number shown",
    {
      startNumber: 2,
      evenPages: {
        header: slots("{page}", "", "{chapter}"),
        footer: slots("", "{file}", ""),
      },
    },
  ],
];

describe("the bands of the engine and of Blank's exports", () => {
  it.each(layouts)("are the same with %s", (_, settings) => {
    const layout: Layout = {
      ...testLayout(),
      header: slots("{title}", "{chapter}", "Page {page} of {pages}"),
      footer: slots("{author}", "{page}", "{date}"),
      ...settings,
    };
    const fields = documentFields(node, "/docs/report.md");
    const engine = testEngine();
    engine.setSettings(layout, fields);
    engine.sync(node, () => undefined);
    const pages = engine.pages();
    expect(pages).toBe(3);

    for (let page = 1; page <= pages; page++) {
      const bands = bandsOn(layout, page);
      const values = fieldValues(
        layout,
        page,
        pages,
        fields,
        chapters[page - 1],
      );
      const expected = [
        ...SLOTS.map((slot) => expand(bands.header[slot], values)),
        ...SLOTS.map((slot) => expand(bands.footer[slot], values)),
      ];
      expect(engine.bands(page - 1), `page ${page}`).toEqual(expected);
    }
  });
});
