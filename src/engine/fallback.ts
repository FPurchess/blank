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

const EMOJI = /\p{Extended_Pictographic}/u;

// the characters already looked for, found or not, with the language they
// were looked for in, which picks e.g. Chinese or Japanese forms (emoji
// have none); not those whose lookup failed, which are looked for again
const asked = new Set<string>();

const askedKey = (char: string, language: string) =>
  EMOJI.test(char) ? char : `${language}:${char}`;

/**
 * missingOf returns the characters of `missing` not looked for yet in
 * `language`, as emoji and the rest
 */
export const missingOf = (missing: string, language = "") => {
  const emoji: string[] = [];
  const other: string[] = [];
  for (const char of missing) {
    if (asked.has(askedKey(char, language))) continue;
    (EMOJI.test(char) ? emoji : other).push(char);
  }
  return { emoji, other };
};

interface SystemFont {
  family: string;
  path: string;
}

// the lookup running, which the next one waits for: one for the same
// characters then finds them looked for, and the fonts loaded
let running: Promise<unknown> = Promise.resolve();

/**
 * findFonts loads the fonts for the characters of `missing`. A lookup that
 * fails is tried again the next time.
 * @param language the document's language, which picks e.g. the Chinese or
 *   Japanese forms of Han characters
 * @returns the fonts it found, none if it looked for them all before
 */
export const findFonts = (
  missing: string,
  language: string,
): Promise<FallbackFont[]> => {
  const next = running.then(() => lookUp(missing, language));
  running = next.catch(() => {});
  return next;
};

const lookUp = async (
  missing: string,
  language: string,
): Promise<FallbackFont[]> => {
  const { emoji, other } = missingOf(missing, language);
  const found: FallbackFont[] = [];
  const known = (family: string) =>
    [...fallbackFonts.value, ...found].some((font) => font.family === family);
  const lookedFor = (chars: string[]) =>
    chars.forEach((char) => asked.add(askedKey(char, language)));
  if (emoji.length && known(EMOJI_FAMILY)) lookedFor(emoji);
  else if (emoji.length) {
    try {
      const response = await fetch(EMOJI_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      found.push({
        family: EMOJI_FAMILY,
        bytes: new Uint8Array(await response.arrayBuffer()),
      });
      lookedFor(emoji);
    } catch (error) {
      console.error("failed to load the emoji font", error);
    }
  }
  if (other.length) {
    let fonts: SystemFont[] | null = null;
    try {
      fonts = await invoke<SystemFont[]>("fallback_fonts", {
        text: other.join(""),
        language,
      });
    } catch (error) {
      console.error("failed to find system fonts", error);
    }
    let read = fonts !== null;
    for (const font of fonts ?? []) {
      if (known(font.family) && !found.some((f) => f.family === font.family))
        continue;
      try {
        found.push({ family: font.family, bytes: await readFile(font.path) });
      } catch (error) {
        read = false;
        console.error(`failed to read ${font.path}`, error);
      }
    }
    // no font for them is an answer too, which asking again won't change
    if (read) lookedFor(other);
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
