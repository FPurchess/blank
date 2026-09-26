import { describe, expect, it } from "vitest";

import { basename, dirname, extname, replaceExtension } from "./paths";

describe("paths", () => {
  it.each([
    ["/home/u/notes.md", "/home/u"],
    ["/notes.md", "/"],
    ["C:\\Users\\u\\notes.md", "C:\\Users\\u"],
    ["C:/Users/u/notes.md", "C:/Users/u"],
    ["notes.md", ""],
  ])("dirname(%j) is %j", (path, expected) => {
    expect(dirname(path)).toBe(expected);
  });

  it.each([
    ["/home/u/notes.md", "notes.md"],
    ["C:\\Users\\u\\report.docx", "report.docx"],
    ["notes", "notes"],
  ])("basename(%j) is %j", (path, expected) => {
    expect(basename(path)).toBe(expected);
  });

  it.each([
    ["/home/u/Notes.MD", "md"],
    ["C:\\docs\\report.docx", "docx"],
    ["/home/u/archive.tar.gz", "gz"],
    ["/home/u/notes", ""],
    ["/home/u/.hidden", ""],
    ["/home/u.v2/notes", ""],
  ])("extname(%j) is %j", (path, expected) => {
    expect(extname(path)).toBe(expected);
  });

  it.each([
    ["/home/u/report.docx", "md", "/home/u/report.md"],
    ["C:\\docs\\report.docx", "pdf", "C:\\docs\\report.pdf"],
    ["/home/u/notes", "md", "/home/u/notes.md"],
    ["/home/u.v2/notes", "md", "/home/u.v2/notes.md"],
    ["/home/u/.hidden", "md", "/home/u/.hidden.md"],
  ])("replaceExtension(%j, %j) is %j", (path, extension, expected) => {
    expect(replaceExtension(path, extension)).toBe(expected);
  });
});
