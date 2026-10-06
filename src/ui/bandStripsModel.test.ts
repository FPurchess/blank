import { describe, expect, it } from "vitest";

import { bandPage, INSERTS } from "./bandStripsModel";

describe("INSERTS", () => {
  it("names the placeholders as the pages do, with a tooltip each", () => {
    expect(INSERTS.map(({ label, tip, text }) => [label, tip, text])).toEqual([
      ["Title", "Insert the title", "{title}"],
      ["Author", "Insert the author", "{author}"],
      ["Chapter", "Insert the chapter", "{chapter}"],
      ["Date", "Insert the date", "{date}"],
      ["File", "Insert the file name", "{file}"],
    ]);
  });
});

describe("bandPage", () => {
  it("names a page's band, counted from 1", () => {
    expect(bandPage("footer", 3)).toBe("footer 3");
  });
});
