import type { ImageMime } from "../images/mime";
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
  images: { src: string; bytes: Uint8Array; kind: ImageKind }[];
  // the diagram module's drawings: the src each is drawn in place of, and
  // its JSON
  drawings?: [string, string][];
  // as JSON, see settingsOf and flatten
  settings: string;
  items: string;
  title: string;
  author: string;
  // a BCP 47 tag, see PageEngine.pdf
  language?: string;
  // when the PDF was made, see pdfDate
  date: string;
  // the pages to write, by their index, if not all
  pages?: number[];
  // or the sheets to print instead, as JSON (see PageEngine.printPdf)
  sheets?: string;
}

// what an image's file is, as the engine's addImage takes it: a PNG or a
// JPEG
export type ImageKind = 0 | 1;

export const imageKind = (mime: ImageMime): ImageKind =>
  mime === "image/jpeg" ? 1 : 0;

// what a PDF left out: an image it couldn't decode, which shows its alt
// text instead, or a font it couldn't embed ("" for one of Blank's own);
// or why it isn't a PDF/A, in plain English
export type PdfWarning =
  | { kind: "image"; src: string }
  | { kind: "font"; font: number; family: string }
  | { kind: "pdfa"; reason: string };

export interface PdfResult {
  pdf: Uint8Array;
  // the pages of the PDF written: the document's, or the sheets to print
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
      engine.addImage(image.src, image.bytes, image.kind);
    for (const [src, json] of job.drawings ?? []) engine.addDrawing(src, json);
    engine.setSettings(job.settings);
    engine.setItems(job.items);
    const written =
      job.sheets !== undefined
        ? {
            pdf: engine.printPdf(job.sheets, job.title),
            pages: (JSON.parse(job.sheets) as unknown[]).length,
          }
        : {
            pdf: engine.pdf(
              job.title,
              job.author,
              job.language ?? null,
              job.date,
              job.pages ? Uint32Array.from(job.pages) : null,
            ),
            pages: job.pages?.length ?? engine.pageCount(),
          };
    return {
      ...written,
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
