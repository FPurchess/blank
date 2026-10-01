import { compileAsync } from "sass-embedded";
import { describe, expect, it } from "vitest";

// DejaVu Sans fills in the characters IBM Plex Sans lacks, and the webview
// loads it only for those: its faces carry the generated unicode-range.

const ranges = (range: string) =>
  [...range.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].map(
    ([, from, to]) => [parseInt(from, 16), parseInt(to ?? from, 16)],
  );

describe("the fallback font", () => {
  it("loads DejaVu Sans only for characters IBM Plex Sans lacks", async () => {
    const { css } = await compileAsync("src/scss/main.scss", {
      loadPaths: ["src/scss"],
      style: "compressed",
    });
    const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(
      ([, body]) => body,
    );
    const dejavu = faces.filter((face) => face.includes("DejaVu Sans"));
    expect(dejavu).toHaveLength(4);
    for (const face of dejavu) {
      const range = /unicode-range:([^;]+)/.exec(face)?.[1];
      expect(range).toBeDefined();
      const has = (point: number) =>
        ranges(range!).some(([from, to]) => from <= point && point <= to);
      // ⇒ and ⇔, which Plex lacks, but not Latin letters or →, which it has
      expect(has(0x21d2)).toBe(true);
      expect(has(0x21d4)).toBe(true);
      expect(has(0x41)).toBe(false);
      expect(has(0xe9)).toBe(false);
      expect(has(0x2192)).toBe(false);
    }
    // Plex itself for every character
    for (const face of faces.filter((face) => face.includes("IBM Plex Sans")))
      expect(face).not.toMatch(/unicode-range/);
  });
});
