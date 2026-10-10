import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import type { ExportResult, exporterFunc } from "../exporters/types";
import {
  failureWarning,
  type PreparedImage,
  prepareImages,
} from "../images/prepare";
import { unknownWarning } from "../markdown/blocks/unknown";
import { sourceKind } from "../sources/registry";
import {
  renderAll,
  renderedOf,
  sourceKeyOf,
  sourceWarning,
} from "../sources/store";
import { drawAll, drawingOf, isVector } from "./vectors";
import { documentFields } from "../layout/bands";
import { type Layout, pageGeometry } from "../layout/resolve";
import {
  baseFonts,
  engineInstanceBroken,
  newEngine,
  settingsOf,
} from "./engine";
import { fallbackFonts, findFonts } from "./fallback";
import { language } from "../state";
import { flatten, type ImageSizes } from "./flatten";
import { fittedSize } from "./images";
import {
  imageKind,
  type PdfJob,
  type PdfResult,
  type PdfWarning,
} from "./pdfJob";
import type { PrintSheet } from "./types";
import type { PdfReply } from "./pdfWorker";

// The PDF, written by the layout engine with krilla from the same layout
// the page view paints: every line and page break as on screen. Once the
// page view's wasm trapped, a worker with a wasm instance of its own writes
// it instead.

/**
 * sizesOf returns the sizes the images of the PDF are laid out with, the
 * same as on screen (see imageSizes)
 */
export const sizesOf =
  (images: Map<string, PreparedImage>, layout: Layout): ImageSizes =>
  (src) => {
    const image = images.get(src);
    if (!image) return undefined;
    const { contentWidth, contentHeight } = pageGeometry(layout);
    return fittedSize(image, { width: contentWidth, height: contentHeight });
  };

// what the PDF holds: the document's pages, all or some (their indexes),
// tagged and with bookmarks; or sheets to print, untagged
type Output = { pages?: number[] } | { sheets: readonly PrintSheet[] };

interface Prepared {
  doc: Node;
  layout: Layout;
  fields: ReturnType<typeof documentFields>;
  images: Map<string, PreparedImage>;
  sizes: ImageSizes;
  output: Output;
  // the diagram module's drawings, by the src of the image each is drawn
  // in place of
  drawings: Map<string, string>;
}

/**
 * imagesToAdd lists the images whose bytes the engine draws: not the
 * drawings, which it draws from their drawings
 */
const imagesToAdd = (images: Map<string, PreparedImage>) =>
  [...images].filter(([, image]) => image.bytes.length > 0);

/**
 * onSharedEngine writes the PDF with an engine of the page view's wasm
 * instance, which throws if the engine fails
 */
const onSharedEngine = async ({
  doc,
  layout,
  fields,
  images,
  sizes,
  output,
  drawings,
}: Prepared): Promise<PdfResult> => {
  const engine = await newEngine(true);
  try {
    for (const [src, image] of imagesToAdd(images)) {
      engine.addImage(src, image.bytes, imageKind(image.mime));
    }
    for (const [src, json] of drawings) engine.addDrawing(src, json);
    engine.setSettings(layout, fields);
    engine.sync(doc, sizes, { sources: { export: true } });
    // fonts for what Blank's fonts lack, e.g. emoji pasted just now, which
    // the engine lays out again with
    const missing = engine.missing();
    if (missing) {
      await findFonts(missing, language.value);
      engine.addFonts(fallbackFonts.value);
    }
    const written =
      "sheets" in output
        ? {
            pdf: engine.printPdf(output.sheets, fields.title),
            pages: output.sheets.length,
          }
        : {
            pdf: engine.pdf(
              fields.title,
              fields.author,
              pdfLanguage(),
              pdfDate(),
              output.pages,
            ),
            pages: output.pages?.length ?? engine.pages(),
          };
    return {
      ...written,
      missing: engine.missing(),
      warnings: engine.pdfWarnings(),
    };
  } finally {
    engine.free();
  }
};

// how long a PDF worker may take, in ms
export const WORKER_TIMEOUT = 60_000;

/**
 * runPdfWorker writes the PDF of a job in a worker of its own
 */
export const runPdfWorker = (job: PdfJob) =>
  new Promise<PdfResult>((resolve, reject) => {
    const worker = new Worker(new URL("./pdfWorker.ts", import.meta.url), {
      type: "module",
    });
    // a worker that hangs, e.g. whose wasm never loads, is given up
    const timer = setTimeout(() => fail("it took too long"), WORKER_TIMEOUT);
    const fail = (message: string) => {
      clearTimeout(timer);
      worker.terminate();
      reject(
        new Error(`the page layout failed while writing the PDF: ${message}`),
      );
    };
    worker.onmessage = (event: MessageEvent<PdfReply>) => {
      const reply = event.data;
      if ("error" in reply) return fail(reply.error);
      clearTimeout(timer);
      worker.terminate();
      resolve(reply.result);
    };
    worker.onerror = (event) => fail(event.message || "the worker failed");
    worker.onmessageerror = () => fail("the worker's reply can't be read");
    // copies, so the page view keeps its own: new Uint8Array copies any
    // view, where slice() of a Node Buffer, say, is a view of the same bytes
    const fonts = job.fonts.map((font) => new Uint8Array(font));
    const fallbacks = job.fallbacks.map(({ family, bytes }) => ({
      family,
      bytes: new Uint8Array(bytes),
    }));
    const images = job.images.map((image) => ({
      ...image,
      bytes: new Uint8Array(image.bytes),
    }));
    worker.postMessage({ ...job, fonts, fallbacks, images }, [
      ...fonts.map((font) => font.buffer),
      ...fallbacks.map((font) => font.bytes.buffer),
      ...images.map((image) => image.bytes.buffer),
    ]);
  });

/**
 * inWorker writes the PDF with a wasm instance of its own, and with the
 * fonts for what Blank's fonts lack, which it tells
 */
const inWorker = async (prepared: Prepared): Promise<PdfResult> => {
  const fonts = await baseFonts();
  const result = await runPdfWorker(jobOf(prepared, fonts));
  if (!result.missing) return result;
  // again with the fonts for what Blank's fonts lack, if any were found
  const known = fallbackFonts.value.length;
  await findFonts(result.missing, language.value);
  return fallbackFonts.value.length > known
    ? runPdfWorker(jobOf(prepared, fonts))
    : result;
};

const jobOf = (
  { doc, layout, fields, images, sizes, output, drawings }: Prepared,
  fonts: Uint8Array[],
): PdfJob => ({
  fonts,
  fallbacks: [...fallbackFonts.value],
  images: imagesToAdd(images).map(([src, image]) => ({
    src,
    bytes: image.bytes,
    kind: imageKind(image.mime),
  })),
  drawings: [...drawings],
  settings: JSON.stringify(settingsOf(layout, fields)),
  // every source block closed, and one that can't be drawn as its source
  items: JSON.stringify(
    flatten(doc, sizes, null, { export: true }).map((record) => record.build()),
  ),
  title: fields.title,
  author: fields.author,
  language: pdfLanguage(),
  date: pdfDate(),
  ...("sheets" in output
    ? { sheets: JSON.stringify(output.sheets) }
    : { pages: output.pages }),
});

/**
 * pdfDate returns `now` as the PDF's date: local time in ISO 8601 with its
 * offset, e.g. "2026-10-01T09:30:00+02:00"
 */
export const pdfDate = (now = new Date()) => {
  const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const minutes = Math.abs(offset);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(minutes / 60)}:${pad(minutes % 60)}`
  );
};

/**
 * pdfLanguage returns the document's language as a BCP 47 tag: the
 * language setting, an ISO 639-1 code ("de") or a dictionary's regional tag
 * ("de-CH"); none when it isn't one
 */
export const pdfLanguage = () => {
  const tag = language.value.trim();
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(tag) ? tag : undefined;
};

/**
 * imageNames returns what to call the images of `doc` in a warning: a file
 * by its path, an image in the document itself by its alt text
 */
/**
 * vectorKeys lists the drawings of `doc`'s sources (diagrams) that could be
 * drawn
 */
const vectorKeys = (doc: Node) => {
  const keys: string[] = [];
  doc.descendants((node) => {
    if (!sourceKind(node.type.name)) return !node.isTextblock;
    if (renderedOf(node)?.ok === true) keys.push(sourceKeyOf(node));
    return false;
  });
  return keys;
};

const imageNames = (doc: Node) => {
  const alts = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name === "image")
      alts.set(
        node.attrs.src as string,
        (node.attrs.alt as string | null) ?? "",
      );
    const kind = sourceKind(node.type.name);
    if (kind) {
      const name = (node.attrs.alt as string) || kind.label(node.textContent);
      alts.set(sourceKeyOf(node), name);
    }
  });
  return (src: string) =>
    src.startsWith("data:")
      ? alts.get(src) || "an image in the document"
      : isVector(src)
        ? (alts.get(src) ?? "a diagram")
        : src;
};

/**
 * describeWarnings tells in plain words what the PDF left out
 * @param nameOf what to call an image, by its src
 */
export const describeWarnings = (
  warnings: readonly PdfWarning[],
  nameOf: (src: string) => string = (src) => src,
) => {
  // each named once, e.g. the faces of one family
  const images = [
    ...new Set(
      warnings.flatMap((warning) =>
        warning.kind === "image" ? [nameOf(warning.src)] : [],
      ),
    ),
  ];
  const fonts = [
    ...new Set(
      warnings.flatMap((warning) =>
        warning.kind === "font"
          ? [warning.family || "one of Blank's fonts"]
          : [],
      ),
    ),
  ];
  const described: string[] = [];
  if (images.length === 1)
    described.push(
      `1 image couldn't be read and shows its alt text: ${images[0]}`,
    );
  else if (images.length > 1)
    described.push(
      `${images.length} images couldn't be read and show their alt text: ${images.join(", ")}`,
    );
  if (fonts.length === 1)
    described.push(
      `1 font couldn't be embedded, so its text is left out: ${fonts[0]}`,
    );
  else if (fonts.length > 1)
    described.push(
      `${fonts.length} fonts couldn't be embedded, so their text is left out: ${fonts.join(", ")}`,
    );
  const pdfa = warnings.flatMap((warning) =>
    warning.kind === "pdfa" ? [warning.reason] : [],
  );
  if (pdfa.length)
    described.push(
      `It's a normal PDF, not a PDF/A for archiving, because ${pdfa.join("; ")}`,
    );
  return described;
};

/**
 * write writes `output` of the document as a PDF, on an engine that shares
 * the page view's fonts, or in a worker once the page view's wasm trapped,
 * with what it left out in plain words
 */
const write = async (
  state: EditorState,
  docPath: string | null,
  layout: Layout,
  output: Output,
): Promise<ExportResult> => {
  // what the sources make, e.g. diagrams, drawn before they're laid out,
  // and as drawings of the diagram module, which the PDF holds as vectors
  // and text; one it can't draw is a picture. The document's PDF and the
  // print PDF alike
  await renderAll(state.doc);
  const keys = vectorKeys(state.doc);
  await drawAll(keys);
  const drawings = new Map(
    keys.flatMap((key) => {
      const json = drawingOf(key);
      return json ? [[key, json] as const] : [];
    }),
  );
  const { images, failures } = await prepareImages(
    state.doc,
    docPath,
    ["image/png", "image/jpeg"],
    { drawings: true },
  );
  const prepared: Prepared = {
    doc: state.doc,
    layout,
    fields: documentFields(state.doc, docPath),
    images,
    sizes: sizesOf(images, layout),
    output,
    drawings,
  };
  let result: PdfResult | null = null;
  if (!engineInstanceBroken()) {
    try {
      result = await onSharedEngine(prepared);
    } catch (error) {
      // an error that didn't come from the engine
      if (!engineInstanceBroken()) throw error;
    }
  }
  result ??= await inWorker(prepared);
  return {
    contents: result.pdf,
    warnings: [
      ...failureWarning(failures),
      ...describeWarnings(result.warnings, imageNames(state.doc)),
      ...sourceWarning(
        state.doc,
        "sheets" in output ? "the printout" : "the PDF",
      ),
      ...unknownWarning(
        state.doc,
        "sheets" in output
          ? { one: "prints as a box", more: "print as boxes" }
          : { one: "is a box in the PDF", more: "are boxes in the PDF" },
      ),
    ],
    pages: result.pages,
  };
};

/**
 * toPDF exports the document's pages, all or those of `pages`, as a PDF/A
 */
const toPDF: exporterFunc = (state, { docPath, layout, pages }) =>
  write(state, docPath, layout, { pages });

/**
 * printPDF writes the PDF to print: `sheets` with the document's pages
 * placed on them
 */
export const printPDF = (
  state: EditorState,
  {
    docPath,
    layout,
    sheets,
  }: { docPath: string | null; layout: Layout; sheets: readonly PrintSheet[] },
) => write(state, docPath, layout, { sheets });

export default toPDF;
