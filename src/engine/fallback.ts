import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { shallowRef } from "vue";

import { EMOJI_FAMILY, EMOJI_URL } from "./fonts";

// Fonts for what Blank's own fonts lack. The engine tells which characters it
// laid out as missing glyphs; emoji get the monochrome Noto Emoji that comes
// with Blank, and other scripts (Chinese, Japanese, Korean, …) the font the
// system has for them (src-tauri/src/fonts.rs). Each is loaded once and
// added to every engine, the page view's and the PDF export's, so both lay
// out the same.

export interface FallbackFont {
  family: string;
  bytes: Uint8Array;
}

// the fonts added, for new engines, e.g. the PDF export's
export const fallbackFonts = shallowRef<readonly FallbackFont[]>([]);

// the characters already looked for, found or not
const asked = new Set<string>();

const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * missingOf returns the characters of `missing` not looked for yet, as emoji
 * and the rest
 */
export const missingOf = (missing: string) => {
  const emoji: string[] = [];
  const other: string[] = [];
  for (const char of missing) {
    if (asked.has(char)) continue;
    (EMOJI.test(char) ? emoji : other).push(char);
  }
  return { emoji, other };
};

interface SystemFont {
  family: string;
  path: string;
}

/**
 * findFonts loads the fonts for the characters of `missing`
 * @param language the document's language, which picks e.g. the Chinese or
 *   Japanese forms of Han characters
 * @returns the fonts it found, none if it looked for them all before
 */
export const findFonts = async (
  missing: string,
  language: string,
): Promise<FallbackFont[]> => {
  const { emoji, other } = missingOf(missing);
  for (const char of [...emoji, ...other]) asked.add(char);
  const found: FallbackFont[] = [];
  const known = (family: string) =>
    [...fallbackFonts.value, ...found].some((font) => font.family === family);
  if (emoji.length && !known(EMOJI_FAMILY)) {
    try {
      const response = await fetch(EMOJI_URL);
      found.push({
        family: EMOJI_FAMILY,
        bytes: new Uint8Array(await response.arrayBuffer()),
      });
    } catch (error) {
      console.error("failed to load the emoji font", error);
    }
  }
  if (other.length) {
    let fonts: SystemFont[] = [];
    try {
      fonts = await invoke<SystemFont[]>("fallback_fonts", {
        text: other.join(""),
        language,
      });
    } catch (error) {
      console.error("failed to find system fonts", error);
    }
    for (const font of fonts) {
      if (known(font.family) && !found.some((f) => f.family === font.family))
        continue;
      try {
        found.push({ family: font.family, bytes: await readFile(font.path) });
      } catch (error) {
        console.error(`failed to read ${font.path}`, error);
      }
    }
  }
  if (found.length) fallbackFonts.value = [...fallbackFonts.value, ...found];
  return found;
};

/**
 * forgetFallbacks forgets the fonts and what was looked for, e.g. between
 * tests
 */
export const forgetFallbacks = () => {
  asked.clear();
  fallbackFonts.value = [];
};
