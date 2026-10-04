import { describe, expect, it } from "vitest";

import { CODE_BACKGROUND } from "../../exporters/docx/template";
import { TABLE_COLORS } from "../../exporters/table";
import { LIGHT_TEXT, onPaper } from "../../layout/paperColors";
import { parseColor, themeVariables } from "../../scss/contrast";
import { testEngine } from "../../test/engine";
import { ROLE_OPACITY } from "./canvas2d";

// The PDF and the Word export show on paper what the pages show on screen:
// the text colour at the opacity of each role, mixed onto white.

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

// the roles of Role in src-tauri/layout/src/items/mod.rs
const CODE_FILL = 2;
const TABLE_LINE = 3;
const HEADER_LINE = 4;
const HEADER_FILL = 5;

describe("the colours on paper", () => {
  const engine = testEngine();
  const pdf = (role: number) => hex(engine.raw.roleColor(role)!);

  it("mixes the light theme's text colour", () => {
    const [red, green, blue] = parseColor(themeVariables("light").color);
    expect(LIGHT_TEXT.map((channel) => channel / 255)).toEqual([
      red,
      green,
      blue,
    ]);
  });

  it("give the PDF the colours the pages show", () => {
    for (const role of [CODE_FILL, TABLE_LINE, HEADER_LINE, HEADER_FILL])
      expect(pdf(role), `role ${role}`).toBe(onPaper(ROLE_OPACITY[role]));
  });

  it("give Word the colours of the PDF", () => {
    expect(TABLE_COLORS).toEqual({
      line: pdf(TABLE_LINE),
      headerLine: pdf(HEADER_LINE),
      headerFill: pdf(HEADER_FILL),
    });
    expect("#" + CODE_BACKGROUND.toLowerCase()).toBe(pdf(CODE_FILL));
  });

  it("keep their own colours for the text, the bands and missing images", () => {
    // black text, links and alt text, as pdfmake did, and grey headers and
    // footers (BAND in src/layout/bands.ts), lighter than their 50% on screen
    expect([0, 7, 8].map(pdf)).toEqual(["#000000", "#000000", "#000000"]);
    expect(pdf(1)).toBe("#666666");
    // 6 is no longer used
    expect(engine.raw.roleColor(6)).toBeUndefined();
    expect(engine.raw.roleColor(9)).toBeUndefined();
  });
});
