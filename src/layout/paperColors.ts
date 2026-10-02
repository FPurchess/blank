// The colours of the PDF and the Word export: what the pages show at an
// opacity of the theme's text colour, mixed onto white paper with the light
// theme's text colour (src/scss/themes/_light.scss). See paper_rgb in
// src-tauri/layout/src/pdf.rs and src/ui/painter/colors.test.ts, which checks
// that they agree.

export const LIGHT_TEXT = [27, 40, 50] as const;

/**
 * onPaper returns the colour that `opacity` of the light theme's text colour
 * gives on white paper, as "#rrggbb"
 */
export const onPaper = (opacity: number) =>
  "#" +
  LIGHT_TEXT.map((channel) =>
    Math.round(255 - (255 - channel) * opacity)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
