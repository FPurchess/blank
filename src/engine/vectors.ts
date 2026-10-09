import { logWarning } from "../log";
import { drawnVectors, vectorPictures } from "../state/drawings";
import { inMarkup, parseColor } from "../diagrams/recolor";
import type { VectorData } from "../sources/registry";
import { language } from "../state/language";
import {
  type DiagramModule,
  diagramModule,
  dropDiagramModule,
} from "./diagramModule";
import { fallbackFonts, findFonts } from "./fallback";

// Drawings made in Blank, e.g. diagrams from their source: images the
// engine lays out and paints like any other, known by a key (`src`) that
// starts with VECTOR, rather than files the webview loads. Their colours
// are the ink at a strength, `ink(0.4)` (see src/diagrams/recolor.ts),
// which `inked` makes the colour of the screen's theme when they're
// painted, and ink on white for the PDF and Word.
//
// The engine draws them from drawings (paths and glyphs in its own fonts,
// so text stays text), which the diagram module makes of their SVG once it
// has loaded (./diagramModule.ts). Until then, and if it can't load, the
// screen shows the SVG as a picture, which can't use the webview's fonts,
// so it holds Blank's font files, unmodified, as data (see withFonts), and
// the PDF a picture of it (src/images/prepare.ts).

export const VECTOR = "blank-vector:";

/**
 * isVector tells whether an image's src is a drawing of this store
 */
export const isVector = (src: string) => src.startsWith(VECTOR);

interface Entry extends VectorData {
  // the screen's pictures of it, by ink
  pictures: Map<string, HTMLImageElement | "loading">;
}

const vectors = new Map<string, Entry>();

// what the diagram module drew of each, the drawing's JSON
const drawn = new Map<string, { json: string; revision: number }>();
let revisions = 0;

// the ink drawings are made in: a colour no author writes, which the
// module takes as the ink at a strength, so an author's own black stays
// black (`INK` in src-tauri/drawings)
// at a strength (see src-tauri/drawings)
const DRAWING_INK = "rgb(1,2,3)";

/**
 * drawingOf returns what the diagram module drew of the drawing `key`
 */
export const drawingOf = (key: string) => drawn.get(key)?.json;

/**
 * drawingRevision tells drawings of `key` apart: it changes whenever the
 * module draws it again, e.g. with a font found for its labels
 */
export const drawingRevision = (key: string) => drawn.get(key)?.revision;

/**
 * drawVector has the diagram module draw `key`, loading it the first time;
 * a module that doesn't load leaves it a picture
 */
export const drawVector = (key: string): Promise<void> => {
  if (drawn.has(key)) return Promise.resolve();
  const entry = vectors.get(key);
  if (!entry) return Promise.resolve();
  const known = drawing.get(key);
  // the same drawing being drawn; one forgotten and put again is drawn anew
  if (known?.entry === entry) return known.running;
  const running = draw(key, entry).finally(() => {
    if (drawing.get(key)?.running === running) drawing.delete(key);
  });
  drawing.set(key, { entry, running });
  return running;
};

// the drawings being drawn, so each is drawn once
const drawing = new Map<string, { entry: Entry; running: Promise<void> }>();

const draw = async (key: string, entry: Entry) => {
  let module: DiagramModule;
  try {
    module = await diagramModule();
  } catch {
    return;
  }
  const svg = inked(entry.svg, DRAWING_INK);
  // a trap in the module leaves its instance unusable: it's given up and
  // loaded again later, and the drawing stays a picture
  const attempt = <T>(call: () => T): T | undefined => {
    try {
      return call();
    } catch (error) {
      dropDiagramModule(error);
      return undefined;
    }
  };
  const drawOnce = () => {
    // forgotten meanwhile
    if (vectors.get(key) !== entry) return false;
    const json = attempt(() => module.draw(svg));
    if (!json) {
      logWarning("the diagram module couldn't draw a diagram");
      return false;
    }
    drawn.set(key, { json, revision: ++revisions });
    drawnVectors.value++;
    return true;
  };
  // the fonts there are before it's drawn: one found meanwhile, by this
  // drawing's lookup or another's (e.g. for the same characters in the
  // document's text), has it drawn again
  const fonts = fallbackFonts.value.length;
  if (!drawOnce()) return;
  // characters of its labels none of the fonts has, e.g. 日本語: drawn
  // again once the system's fonts for them are found, which the module and
  // every engine get from fallbackFonts, as for the document's own text
  const missing = attempt(() => module.missing());
  if (!missing) return;
  await findFonts(missing, language.value).catch(() => []);
  if (fallbackFonts.value.length > fonts) drawOnce();
};

/**
 * drawAll draws each of `keys` that isn't yet, and waits for them
 */
export const drawAll = (keys: Iterable<string>) =>
  Promise.all([...keys].map((key) => drawVector(key)));

/**
 * putVector keeps a drawing under `key`
 */
export const putVector = (key: string, data: VectorData) => {
  vectors.set(key, { ...data, pictures: new Map() });
  void drawVector(key);
};

/**
 * vectorOf returns the drawing kept under `key`
 */
export const vectorOf = (key: string): VectorData | undefined =>
  vectors.get(key);

/**
 * forgetVector forgets a drawing, e.g. one no document shows any more
 */
export const forgetVector = (key: string) => {
  drawn.delete(key);
  vectors.delete(key);
};

/**
 * forgetVectors forgets every drawing, e.g. between tests
 */
export const forgetVectors = () => {
  vectors.clear();
  drawn.clear();
};

const INK = /ink\((\d*\.?\d+)\)/g;

/**
 * inked returns a drawing with its ink in `color`, any CSS colour
 */
export const inked = (svg: string, color: string) => {
  const ink = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const rgb = [ink.r, ink.g, ink.b].map(Math.round).join(",");
  return inMarkup(svg, (markup) =>
    markup.replace(INK, (_, strength: string) => {
      const alpha = Math.min(1, Number(strength) * ink.a);
      return alpha >= 1 ? `rgb(${rgb})` : `rgba(${rgb},${alpha})`;
    }),
  );
};

// Blank's fonts for the screen's pictures: IBM Plex Sans, regular and
// medium, as data URLs of the unmodified files
let fontFaces: string | null = null;

/**
 * setPictureFonts gives the screen's pictures Blank's font files: regular,
 * then medium
 */
export const setPictureFonts = (regular: Uint8Array, medium: Uint8Array) => {
  const face = (bytes: Uint8Array, weight: number) => {
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    }
    return `@font-face{font-family:"IBM Plex Sans";font-weight:${weight};src:url(data:font/ttf;base64,${btoa(binary)}) format("truetype");}`;
  };
  fontFaces = face(regular, 400) + face(medium, 500);
};

/**
 * withFonts returns a drawing that holds Blank's fonts, if it has them
 */
export const withFonts = (svg: string) =>
  fontFaces
    ? svg.replace(/(<svg\b[^>]*>)/, `$1<style>${fontFaces}</style>`)
    : svg;

/**
 * vectorPicture returns the screen's picture of a drawing in `ink`, once
 * the webview decoded it; null until then, and for one there isn't
 */
export const vectorPicture = (
  key: string,
  ink: string,
): HTMLImageElement | null => {
  const entry = vectors.get(key);
  if (!entry) return null;
  const known = entry.pictures.get(ink);
  if (known === "loading") return null;
  if (known) return known;
  entry.pictures.set(ink, "loading");
  const picture = new Image();
  picture.onload = () => {
    if (vectors.get(key) !== entry) return;
    entry.pictures.set(ink, picture);
    vectorPictures.value++;
  };
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    withFonts(inked(entry.svg, ink)),
  )}`;
  return null;
};
