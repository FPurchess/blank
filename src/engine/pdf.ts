import type { Node } from "prosemirror-model";

import type { exporterFunc } from "../exporters/types";
import {
  failureWarning,
  type PreparedImage,
  prepareImages,
} from "../images/prepare";
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
import type { PdfJob, PdfResult, PdfWarning } from "./pdfJob";
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

interface Prepared {
  doc: Node;
  layout: Layout;
  fields: ReturnType<typeof documentFields>;
  images: Map<string, PreparedImage>;
  sizes: ImageSizes;
}

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
}: Prepared): Promise<PdfResult> => {
  const engine = await newEngine(true);
  try {
    for (const [src, image] of images) {
      engine.addImage(src, image.bytes, image.mime === "image/jpeg");
    }
    engine.setSettings(layout, fields);
    engine.sync(doc, sizes);
    // fonts for what Blank's fonts lack, e.g. emoji pasted just now, which
    // the engine lays out again with
    const missing = engine.missing();
    if (missing) {
      await findFonts(missing, language.value);
      engine.addFonts(fallbackFonts.value);
    }
    return {
      pdf: engine.pdf(fields.title, fields.author, pdfLanguage()),
      pages: engine.pages(),
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
  { doc, layout, fields, images, sizes }: Prepared,
  fonts: Uint8Array[],
): PdfJob => ({
  fonts,
  fallbacks: [...fallbackFonts.value],
  images: [...images].map(([src, image]) => ({
    src,
    bytes: image.bytes,
    jpeg: image.mime === "image/jpeg",
  })),
  settings: JSON.stringify(settingsOf(layout, fields)),
  items: JSON.stringify(flatten(doc, sizes).map((record) => record.build())),
  title: fields.title,
  author: fields.author,
  language: pdfLanguage(),
});

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
const imageNames = (doc: Node) => {
  const alts = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name === "image")
      alts.set(
        node.attrs.src as string,
        (node.attrs.alt as string | null) ?? "",
      );
  });
  return (src: string) =>
    src.startsWith("data:") ? alts.get(src) || "an image in the document" : src;
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
  return described;
};

const toPDF: exporterFunc = async (state, { docPath, layout }) => {
  const { images, failures } = await prepareImages(state.doc, docPath, [
    "image/png",
    "image/jpeg",
  ]);
  const prepared: Prepared = {
    doc: state.doc,
    layout,
    fields: documentFields(state.doc, docPath),
    images,
    sizes: sizesOf(images, layout),
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
    ],
    pages: result.pages,
  };
};

export default toPDF;
