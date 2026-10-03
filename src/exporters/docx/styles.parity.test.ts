import { describe, expect, it } from "vitest";

import { testEngine } from "../../test/engine";
import { STYLE, STYLES } from "./template";

// The Word styles repeat the engine's type scale (src-tauri/layout/src/
// style.rs), which sets the pages and the PDF: the sizes, the line heights
// as factors of IBM Plex Sans' natural 1.3 em, the tracking and the slant.

const NAMES = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "code", "caption"];

interface EngineStyle {
  size: number;
  factor: number;
  weight: number;
  italic: boolean;
  tracking: number;
  mono: boolean;
}

const engineStyles = (): Record<string, EngineStyle> => {
  const values = testEngine().raw.textStyles();
  return Object.fromEntries(
    NAMES.map((name, index) => {
      const [size, factor, weight, italic, tracking, mono] = values.slice(
        index * 6,
        index * 6 + 6,
      );
      return [
        name,
        {
          size,
          factor,
          weight,
          italic: italic === 1,
          tracking,
          mono: mono === 1,
        },
      ];
    }),
  );
};

// what Word gets: sizes in half points, lines in 240ths, tracking in
// twentieths of a point
const halfPoints = (points: number) => Math.round(points * 2);
const line = (factor: number) => Math.round(factor * 1.3 * 240);
const twentieths = (points: number) => Math.round(points * 20);

interface WordStyle {
  run?: {
    size?: number;
    bold?: boolean;
    italics?: boolean;
    characterSpacing?: number;
  };
  paragraph?: { spacing?: { line?: number } };
}

const word = STYLES as unknown as {
  default: Record<string, WordStyle>;
  paragraphStyles: (WordStyle & { id: string })[];
};
const paragraphStyle = (id: string) =>
  word.paragraphStyles.find((style) => style.id === id)!;

describe("the Word styles", () => {
  const engine = engineStyles();

  it("set the body text as the pages do", () => {
    const body = word.default.document;
    expect(body.run?.size).toBe(halfPoints(engine.p.size));
    expect(body.paragraph?.spacing?.line).toBe(line(engine.p.factor));
  });

  it.each([1, 2, 3, 4, 5, 6])("set heading %i as the pages do", (level) => {
    const style = engine[`h${level}`];
    const heading = word.default[`heading${level}`];
    expect(heading.run?.size).toBe(halfPoints(style.size));
    expect(heading.paragraph?.spacing?.line).toBe(line(style.factor));
    expect(heading.run?.characterSpacing ?? 0).toBe(twentieths(style.tracking));
    expect(heading.run?.italics).toBe(style.italic);
    // headings 1 to 3 are medium on the pages; Word embeds only the regular
    // face, and a synthesized bold would be much heavier, so they're regular
    expect(heading.run?.bold).toBe(level > 3 && style.weight >= 700);
  });

  it("set code and captions as the pages do", () => {
    const code = paragraphStyle(STYLE.codeBlock);
    expect(engine.code.mono).toBe(true);
    expect(code.run?.size).toBe(halfPoints(engine.code.size));
    // Word sets code single-spaced, where the pages put it on the body's
    // lines
    expect(code.paragraph?.spacing?.line).toBe(240);

    const caption = paragraphStyle(STYLE.caption);
    expect(caption.run?.size).toBe(halfPoints(engine.caption.size));
    expect(caption.run?.italics).toBe(engine.caption.italic);
  });
});
