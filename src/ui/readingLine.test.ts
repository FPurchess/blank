import { describe, expect, it } from "vitest";

import { READING_LINE } from "../chrome";
import { sectionAt } from "./readingLine";

describe("sectionAt", () => {
  const tops = [100, 600, 1200, 1800];
  const line = READING_LINE + 1;

  it("marks the last heading at or above where a click puts one", () => {
    expect(sectionAt(tops, 600 - line, 500, 5000)).toBe(1);
    expect(sectionAt(tops, 600 - line - 1, 500, 5000)).toBe(0);
    expect(sectionAt(tops, 1500, 500, 5000)).toBe(2);
  });

  it("marks the first heading above the first one", () => {
    expect(sectionAt([300, 600], 0, 500, 5000)).toBe(0);
  });

  it("marks the last heading in view at the end, which can't scroll up", () => {
    // scrolled to the end at 1500: the last heading is in view below the line
    expect(sectionAt(tops, 1500, 500, 1500)).toBe(3);
  });

  it("keeps to the line in a document shorter than the view", () => {
    expect(sectionAt([100, 300], 0, 800, 0)).toBe(0);
  });

  it("skips headings that aren't laid out", () => {
    expect(sectionAt([null, 100, null, 900], 900, 500, 5000)).toBe(3);
    expect(sectionAt([null, 300], 0, 500, 5000)).toBe(1);
    expect(sectionAt([null, null], 0, 500, 5000)).toBe(0);
  });

  it("marks a single heading", () => {
    expect(sectionAt([5000], 0, 500, 9000)).toBe(0);
  });
});
