import { describe, expect, it } from "vitest";

import { classifySrc, resolveLocalPath } from "./src";

describe("images.src", () => {
  it.each([
    ["data:image/png;base64,AAAA", "data"],
    ["https://example.com/a.png", "remote"],
    ["HTTP://example.com/a.png", "remote"],
    ["/home/u/a.png", "absolute"],
    ["C:\\Users\\u\\a.png", "absolute"],
    ["C:/Users/u/a.png", "absolute"],
    ["\\\\server\\share\\a.png", "absolute"],
    ["img/a.png", "relative"],
    ["./a.png", "relative"],
    ["../a.png", "relative"],
  ])("classifies %j as %s", (src, kind) => {
    expect(classifySrc(src)).toBe(kind);
  });

  it.each([
    ["img/a%20b.png", "/home/u/notes.md", "/home/u/img/a b.png"],
    ["./a.png", "/home/u/notes.md", "/home/u/a.png"],
    ["../a.png", "/home/u/notes.md", "/home/u/../a.png"],
    ["a.png", "/notes.md", "/a.png"],
    ["a.png", "notes.md", "a.png"],
    ["img/x.png", "C:\\docs\\a.md", "C:\\docs\\img/x.png"],
    ["img/x.png", "C:/docs/a.md", "C:/docs/img/x.png"],
    ["/srv/my%20pic.png", "/home/u/notes.md", "/srv/my pic.png"],
    ["/srv/pic.png", null, "/srv/pic.png"],
    ["100%.png", "/home/u/notes.md", "/home/u/100%.png"],
  ])("resolves %j next to %j", (src, docPath, expected) => {
    expect(resolveLocalPath(src, docPath)).toBe(expected);
  });

  it("can't resolve a relative src without a document path", () => {
    expect(resolveLocalPath("img/a.png", null)).toBeNull();
  });
});
