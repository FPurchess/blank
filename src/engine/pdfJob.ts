import type { LayoutEngine } from "./wasm/blank_layout.js";

// A PDF written by an engine of its own, from what the main thread prepared:
// the fonts, the images, the settings and the flattened items. The PDF
// export runs it in a worker once the page view's wasm trapped (see pdf.ts),
// since the wasm's glue has one instance per module, which a trap leaves
// unusable.

export interface PdfJob {
  // Blank's font files, then the fallback fonts with their families
  fonts: Uint8Array[];
  fallbacks: { family: string; bytes: Uint8Array }[];
  images: { src: string; bytes: Uint8Array; jpeg: boolean }[];
  // as JSON, see settingsOf and flatten
  settings: string;
  items: string;
  title: string;
  author: string;
  // a BCP 47 tag, see PageEngine.pdf
  language?: string;
}

// what a PDF left out: an image it couldn't decode, which shows its alt
// text instead, or a font it couldn't embed ("" for one of Blank's own)
export type PdfWarning =
  | { kind: "image"; src: string }
  | { kind: "font"; font: number; family: string };

export interface PdfResult {
  pdf: Uint8Array;
  pages: number;
  // the characters no font had, for a second job with more fonts
  missing: string;
  warnings: PdfWarning[];
}

/**
 * packFonts puts the font files one after the other, as the engine takes
 * them, with the length of each
 */
export const packFonts = (fonts: readonly Uint8Array[]) => {
  const lengths = new Uint32Array(fonts.map((font) => font.length));
  const bytes = new Uint8Array(
    lengths.reduce((sum, length) => sum + length, 0),
  );
  let offset = 0;
  for (const font of fonts) {
    bytes.set(font, offset);
    offset += font.length;
  }
  return { bytes, lengths };
};

/**
 * writePdf lays out a job with a new engine of `Engine`'s wasm instance and
 * writes its PDF
 */
export const writePdf = (
  Engine: typeof LayoutEngine,
  job: PdfJob,
): PdfResult => {
  const { bytes, lengths } = packFonts(job.fonts);
  const engine = new Engine(bytes, lengths);
  try {
    for (const font of job.fallbacks) engine.addFont(font.bytes, font.family);
    for (const image of job.images)
      engine.addImage(image.src, image.bytes, image.jpeg);
    engine.setSettings(job.settings);
    engine.setItems(job.items);
    return {
      pdf: engine.pdf(job.title, job.author, job.language ?? null),
      pages: engine.pageCount(),
      missing: engine.missing(),
      warnings: JSON.parse(engine.pdfWarnings()) as PdfWarning[],
    };
  } finally {
    try {
      engine.free();
    } catch {
      // a trapped engine may not free; the error that trapped it tells more
    }
  }
};
