import { describe, expect, it } from "vitest";

import { fitsInView, INSERTS } from "./bandStripsModel";

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

describe("fitsInView", () => {
  const view = { left: 0, top: 80, width: 1000, height: 720 };
  const band = (top: number) => ({ left: 0, top, width: 600, height: 20 });

  it("needs room for the strip above a footer", () => {
    expect(fitsInView(band(500), "footer", view, 200)).toBe(true);
    expect(fitsInView(band(250), "footer", view, 200)).toBe(false);
  });

  it("needs room for the strip below a header", () => {
    expect(fitsInView(band(500), "header", view, 200)).toBe(true);
    expect(fitsInView(band(650), "header", view, 200)).toBe(false);
  });

  it("needs the band in the view", () => {
    expect(fitsInView(band(60), "header", view, 0)).toBe(false);
    expect(fitsInView(band(790), "footer", view, 0)).toBe(false);
  });
});
