import { describe, expect, it } from "vitest";

import { escape, expand, segments } from "./tokens";

describe("segments", () => {
  it("splits text and placeholders", () => {
    expect(segments("Page {page} of {pages}")).toEqual([
      "Page ",
      { field: "page" },
      " of ",
      { field: "pages" },
    ]);
    expect(segments("{title} — {author}")).toEqual([
      { field: "title" },
      " — ",
      { field: "author" },
    ]);
  });

  it("knows the chapter, date and file", () => {
    expect(segments("{chapter}{date}{file}")).toEqual([
      { field: "chapter" },
      { field: "date" },
      { field: "file" },
    ]);
  });

  it("keeps other braces and {{ as text", () => {
    expect(segments("{time} {{page} {x")).toEqual(["{time} {page} {x"]);
    expect(segments("")).toEqual([]);
  });
});

describe("expand", () => {
  const values = {
    page: "3",
    pages: "12",
    title: "Hi",
    author: "Ada",
    chapter: "Tides",
    date: "1 May",
    file: "notes",
  };

  it("writes the values into the placeholders", () => {
    expect(expand("{title}: {page}/{pages}, by {author}", values)).toBe(
      "Hi: 3/12, by Ada",
    );
  });

  it("round-trips escaped text", () => {
    expect(expand(escape("{page} {{"), values)).toBe("{page} {{");
  });
});
