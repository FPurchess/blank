import { type FallbackFont, fallbackFonts } from "../engine/fallback";
import { logError } from "../log";
import ams from "../../fonts/katex/KaTeX_AMS-Regular.ttf?url";
import caligraphicBold from "../../fonts/katex/KaTeX_Caligraphic-Bold.ttf?url";
import caligraphic from "../../fonts/katex/KaTeX_Caligraphic-Regular.ttf?url";
import frakturBold from "../../fonts/katex/KaTeX_Fraktur-Bold.ttf?url";
import fraktur from "../../fonts/katex/KaTeX_Fraktur-Regular.ttf?url";
import mainBold from "../../fonts/katex/KaTeX_Main-Bold.ttf?url";
import mainBoldItalic from "../../fonts/katex/KaTeX_Main-BoldItalic.ttf?url";
import mainItalic from "../../fonts/katex/KaTeX_Main-Italic.ttf?url";
import main from "../../fonts/katex/KaTeX_Main-Regular.ttf?url";
import mathBoldItalic from "../../fonts/katex/KaTeX_Math-BoldItalic.ttf?url";
import mathItalic from "../../fonts/katex/KaTeX_Math-Italic.ttf?url";
import sansBold from "../../fonts/katex/KaTeX_SansSerif-Bold.ttf?url";
import sansItalic from "../../fonts/katex/KaTeX_SansSerif-Italic.ttf?url";
import sans from "../../fonts/katex/KaTeX_SansSerif-Regular.ttf?url";
import script from "../../fonts/katex/KaTeX_Script-Regular.ttf?url";
import size1 from "../../fonts/katex/KaTeX_Size1-Regular.ttf?url";
import size2 from "../../fonts/katex/KaTeX_Size2-Regular.ttf?url";
import size3 from "../../fonts/katex/KaTeX_Size3-Regular.ttf?url";
import size4 from "../../fonts/katex/KaTeX_Size4-Regular.ttf?url";
import typewriter from "../../fonts/katex/KaTeX_Typewriter-Regular.ttf?url";

/*
 * The KaTeX fonts formulas are set in, loaded only for a document with
 * math: added to every engine as fallback fonts of the family
 * `math:<name>`, which the engine keeps for formulas (see
 * src-tauri/layout/src/math.rs), so the page view, the PDF export and its
 * worker all get them as they get the other fallbacks. They are the KaTeX
 * project's files, as they are (SIL OFL 1.1, see fonts/katex/KaTeX Fonts License.txt).
 */

export const MATH_FAMILY = "math:";

// RaTeX's name of each font, and its file
export const MATH_FONTS: readonly [string, string][] = [
  ["AMS-Regular", ams],
  ["Caligraphic-Bold", caligraphicBold],
  ["Caligraphic-Regular", caligraphic],
  ["Fraktur-Bold", frakturBold],
  ["Fraktur-Regular", fraktur],
  ["Main-Bold", mainBold],
  ["Main-BoldItalic", mainBoldItalic],
  ["Main-Italic", mainItalic],
  ["Main-Regular", main],
  ["Math-BoldItalic", mathBoldItalic],
  ["Math-Italic", mathItalic],
  ["SansSerif-Bold", sansBold],
  ["SansSerif-Italic", sansItalic],
  ["SansSerif-Regular", sans],
  ["Script-Regular", script],
  ["Size1-Regular", size1],
  ["Size2-Regular", size2],
  ["Size3-Regular", size3],
  ["Size4-Regular", size4],
  ["Typewriter-Regular", typewriter],
];

let loading: Promise<void> | null = null;

/**
 * wantMathFonts says a document has math: flatten calls it for every
 * formula it flattens, and the fonts load once, in the background; the
 * engines get them as fallback fonts, which lays the formulas out again
 */
export const wantMathFonts = () => {
  if (!loading) void loadMathFonts();
};

/**
 * loadMathFonts loads the math fonts, once, and adds them to the fallback
 * fonts every engine gets
 */
export const loadMathFonts = () =>
  (loading ??= (async () => {
    const fonts: FallbackFont[] = await Promise.all(
      MATH_FONTS.map(async ([name, url]) => ({
        family: `${MATH_FAMILY}${name}`,
        bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()),
      })),
    );
    fallbackFonts.value = [...fallbackFonts.value, ...fonts];
  })().catch((error: unknown) => {
    // tried again for the next document with math
    loading = null;
    logError("failed to load the math fonts", error);
  }));

/**
 * hasMath tells whether `doc` holds math
 */
export const hasMath = (doc: import("prosemirror-model").Node) => {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    found =
      node.type.name === "math_inline" || node.type.name === "math_display";
    return !found;
  });
  return found;
};
