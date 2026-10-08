import pinyon from "../../fonts/PinyonScript-Regular.ttf?url";
import msMadi from "../../fonts/MsMadi-Regular.ttf?url";
import dancing from "../../fonts/DancingScript-Regular.ttf?url";
import caveat from "../../fonts/Caveat-Regular.ttf?url";

import { logWarning } from "../log";

// The fonts a typed signature can be set in: the upstream files as they are
// (Dancing Script's name is reserved, like Plex, so its file is never
// changed; the others' licences allow it, but they stay as they are too). A
// typed signature becomes a picture, like a drawn one, so only the webview
// loads them, once the user types a signature.

export const SIGNATURE_FONTS = [
  "Pinyon Script",
  "Ms Madi",
  "Dancing Script",
  "Caveat",
] as const;
export type SignatureFont = (typeof SIGNATURE_FONTS)[number];

const FILES: Record<SignatureFont, string> = {
  "Pinyon Script": pinyon,
  "Ms Madi": msMadi,
  "Dancing Script": dancing,
  Caveat: caveat,
};

// how each font is described in the dialog
export const FONT_STYLES: Record<SignatureFont, string> = {
  "Pinyon Script": "Formal",
  "Ms Madi": "Quick",
  "Dancing Script": "Legible",
  Caveat: "Handwritten",
};

/**
 * isSignatureFont tells whether `value` names a font a signature can be set in
 */
export const isSignatureFont = (value: unknown): value is SignatureFont =>
  (SIGNATURE_FONTS as readonly unknown[]).includes(value);

const loading = new Map<SignatureFont, Promise<void>>();

/**
 * loadSignatureFont loads a signature font into the webview, once; the
 * family is then known by its name. A font that can't load leaves the
 * webview's fallback, which the dialog's preview shows.
 */
export const loadSignatureFont = (font: SignatureFont) => {
  let loaded = loading.get(font);
  // nowhere to load it to, as in jsdom
  if (typeof FontFace === "undefined") return Promise.resolve();
  if (!loaded) {
    loaded = new FontFace(font, `url(${FILES[font]})`)
      .load()
      .then((face) => {
        document.fonts.add(face);
      })
      .catch((error: unknown) => {
        loading.delete(font);
        logWarning(`failed to load the font ${font}`, error);
      });
    loading.set(font, loaded);
  }
  return loaded;
};

/**
 * loadSignatureFonts loads every signature font, e.g. for the dialog's
 * choices
 */
export const loadSignatureFonts = () =>
  Promise.all(SIGNATURE_FONTS.map(loadSignatureFont));
