// Writes the characters DejaVu Sans is there for: those it has and one of the
// faces of IBM Plex Sans lacks, as a CSS unicode-range, so the webview loads a
// DejaVu face only when such a character shows (src/scss/_typography.scss).
// Run it by hand after changing the fonts in public/fonts/, and commit the
// result: `bun scripts/build-fallback-ranges.ts`.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import * as fontkit from "fontkit";

const root = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(root, "src/scss/_fallback-ranges.scss");

const PLEX = [
  "IBMPlexSans-Regular",
  "IBMPlexSans-Italic",
  "IBMPlexSans-Medium",
  "IBMPlexSans-MediumItalic",
  "IBMPlexSans-Bold",
  "IBMPlexSans-BoldItalic",
];
const DEJAVU = [
  "dejavu-sans",
  "dejavu-sans-bold",
  "dejavu-sans-oblique",
  "dejavu-sans-bold-oblique",
];

// the code points a font file maps to a glyph
const coverage = (file: string) => {
  const font = fontkit.openSync(
    resolve(root, "public/fonts", `${file}.woff2`),
  ) as fontkit.Font;
  return new Set(font.characterSet);
};

const plex = PLEX.map(coverage);
const dejavu = new Set(DEJAVU.flatMap((file) => [...coverage(file)]));
// what DejaVu has and any Plex face lacks; the controls and spaces below
// U+0020 never show as glyphs
const fallback = [...dejavu]
  .filter((point) => point >= 0x20 && plex.some((face) => !face.has(point)))
  .sort((a, b) => a - b);

// consecutive code points as ranges
const ranges: [number, number][] = [];
for (const point of fallback) {
  const last = ranges[ranges.length - 1];
  if (last && last[1] === point - 1) last[1] = point;
  else ranges.push([point, point]);
}
const hex = (point: number) => point.toString(16).toUpperCase();
const range = ranges
  .map(([from, to]) =>
    from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`,
  )
  .join(", ");

writeFileSync(
  OUTPUT,
  [
    "// Written by scripts/build-fallback-ranges.ts, don't edit it by hand:",
    "// the characters DejaVu Sans has and a face of IBM Plex Sans lacks.",
    `$fallback-range: ${range};`,
    "",
  ].join("\n"),
);
console.log(
  `wrote ${OUTPUT}: ${fallback.length} characters in ${ranges.length} ranges`,
);
