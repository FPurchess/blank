import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PageEngine } from "../engine/engine";
import { schema } from "../markdown";
import { MATH_FAMILY, MATH_FONTS } from "../math/fonts";

// builders of math nodes, and the math fonts for an engine in tests

export const inlineMath = (source: string) =>
  schema.nodes.math_inline.create(null, source ? schema.text(source) : null);

export const displayMath = (source: string, attrs = {}) =>
  schema.nodes.math_display.create(
    attrs,
    schema.nodes.math_display_source.create(
      null,
      source ? schema.text(source) : null,
    ),
  );

const root = resolve(import.meta.dirname, "../..");

/**
 * withMathFonts adds the KaTeX fonts to `engine`, loaded from disk
 */
export const withMathFonts = (engine: PageEngine) => {
  engine.addFonts(
    MATH_FONTS.map(([name]) => ({
      family: `${MATH_FAMILY}${name}`,
      bytes: readFileSync(resolve(root, `fonts/katex/KaTeX_${name}.ttf`)),
    })),
  );
  return engine;
};
