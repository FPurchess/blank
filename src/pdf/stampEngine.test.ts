import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetEngineFailure, useFallbackEditor } from "../engine/engine";
import { savedMarks } from "../state";
import { IMAGES } from "../test/images";
import { paintCalls } from "../test/canvas";
import { testEngine } from "../test/engine";
import { naturalSize, paintStamp, releaseStamp, stampPdf } from "./stampEngine";
import { type StampSpec, STAMPS_NEED_LAYOUT } from "./stamps";

// The stamps as Blank's engine lays them out: their own size, what is
// painted of them, and their one-page PDFs.

const has = (tool: string) => {
  try {
    execFileSync(tool, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    if (process.env.CI)
      throw new Error(
        `${tool} is missing: install poppler, CI doesn't skip this test`,
      );
    return false;
  }
};

const dir = mkdtempSync(join(tmpdir(), "blank-stamps-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const pdfInfo = (contents: Uint8Array, name: string) => {
  const file = join(dir, name);
  writeFileSync(file, contents);
  return {
    info: execFileSync("pdfinfo", [file], { encoding: "utf8" }),
    text: execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }),
  };
};

const date: StampSpec = {
  lines: ["12 October 2026"],
  size: 11,
  align: "left",
};

const initials: StampSpec = {
  image: "initials",
  lines: [],
  size: 11,
  align: "center",
};

beforeEach(() => {
  testEngine();
  savedMarks.value = {
    signature: null,
    initials: {
      source: { kind: "image" },
      png: `data:image/png;base64,${IMAGES.png}`,
      width: 60,
      height: 30,
    },
  };
});

afterEach(async () => {
  // every look the tests lay out
  for (const spec of [
    date,
    initials,
    { ...date, lines: ["12 October 2026", "in Berlin"] },
  ])
    await releaseStamp(spec);
  savedMarks.value = undefined;
  forgetEngineFailure();
});

describe("a stamp's natural size", () => {
  it("is as wide as its widest line and as high as its lines", async () => {
    const one = await naturalSize(date);
    expect(one.width).toBeGreaterThan(40);
    expect(one.width).toBeLessThan(150);
    expect(one.height).toBeCloseTo(11 * 1.3 * 1.12, 1);
    const two = await naturalSize({
      ...date,
      lines: ["12 October 2026", "in Berlin"],
    });
    expect(two.width).toBe(one.width);
    expect(two.height).toBeCloseTo(2 * one.height, 1);
    // larger letters, a larger stamp
    const larger = await naturalSize({ ...date, size: 22 });
    expect(larger.width).toBeCloseTo(2 * one.width, 0);
  });

  it("is its image's as large as fits on the page it's laid out on", async () => {
    expect(await naturalSize(initials)).toEqual({ width: 400, height: 200 });
  });
});

describe("a stamp's PDF", () => {
  it("is one page of the size asked, holding its lines", async () => {
    if (!has("pdfinfo")) return;
    const { width, height } = await naturalSize(date);
    const pdf = await stampPdf(date, width, height);
    const { info, text } = pdfInfo(pdf, "date.pdf");
    expect(info).toMatch(/^Pages:\s+1$/m);
    const [, w, h] = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info)!;
    expect(Number(w)).toBeCloseTo(width, 1);
    expect(Number(h)).toBeCloseTo(height, 1);
    // the line unbroken in a box of its natural width
    expect(text.trim()).toBe("12 October 2026");
  });

  it("holds the initials' image", async () => {
    if (!has("pdfimages")) return;
    const pdf = await stampPdf(initials, 56, 28);
    const file = join(dir, "initials.pdf");
    writeFileSync(file, pdf);
    const images = execFileSync("pdfimages", ["-list", file], {
      encoding: "utf8",
    });
    expect(images.split("\n").slice(2).filter(Boolean)).toHaveLength(1);
    expect(pdfInfo(pdf, "initials.pdf").info).toMatch(
      /^Page size:\s+56 x 28 pts/m,
    );
  });

  it("isn't written without the initials it stamps", async () => {
    savedMarks.value = { signature: null, initials: null };
    await expect(stampPdf(initials, 56, 28)).rejects.toThrow(/initials/);
  });

  it("follows the stamp's size, on the one engine of what it shows", async () => {
    if (!has("pdfinfo")) return;
    await stampPdf(date, 100, 20);
    const pdf = await stampPdf({ ...date, size: 5.5 }, 50, 10);
    expect(pdfInfo(pdf, "small.pdf").info).toMatch(
      /^Page size:\s+50 x 10 pts/m,
    );
  });
});

describe("painting a stamp", () => {
  it("paints its lines in the ink of paper, at the canvas' scale", async () => {
    const canvas = document.createElement("canvas");
    const painted = await paintStamp(
      date,
      canvas,
      { width: 100, height: 20 },
      2,
    );
    expect(painted).toBe(true);
    expect(canvas.width).toBe(200 * (window.devicePixelRatio || 1));
    const calls = paintCalls(canvas);
    const glyphs = calls.filter((call) => call[0] === "fill");
    // a glyph for each character, the spaces' too
    expect(glyphs).toHaveLength("12 October 2026".length);
    expect(calls).toContainEqual(["style", "#000000", 1]);
  });

  it("says so while its image hasn't loaded", async () => {
    const canvas = document.createElement("canvas");
    // jsdom never loads images
    expect(
      await paintStamp(initials, canvas, { width: 56, height: 28 }, 1),
    ).toBe(false);
  });

  it("lays it out again on a new engine once its engine was released", async () => {
    await naturalSize(date);
    await releaseStamp(date);
    expect((await naturalSize(date)).width).toBeGreaterThan(40);
  });
});

describe("stamps without the page layout", () => {
  it("can't be laid out", async () => {
    useFallbackEditor("unavailable");
    await expect(naturalSize(date)).rejects.toThrow(STAMPS_NEED_LAYOUT);
    await expect(stampPdf(date, 10, 10)).rejects.toThrow(STAMPS_NEED_LAYOUT);
  });
});
