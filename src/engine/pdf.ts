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
import type { PdfJob, PdfResult } from "./pdfJob";
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
      pdf: engine.pdf(fields.title, fields.author),
      pages: engine.pages(),
      missing: engine.missing(),
    };
  } finally {
    engine.free();
  }
};

/**
 * runPdfWorker writes the PDF of a job in a worker of its own
 */
export const runPdfWorker = (job: PdfJob) =>
  new Promise<PdfResult>((resolve, reject) => {
    const worker = new Worker(new URL("./pdfWorker.ts", import.meta.url), {
      type: "module",
    });
    const fail = (message: string) => {
      worker.terminate();
      reject(
        new Error(`the page layout failed while writing the PDF: ${message}`),
      );
    };
    worker.onmessage = (event: MessageEvent<PdfReply>) => {
      const reply = event.data;
      if ("error" in reply) return fail(reply.error);
      worker.terminate();
      resolve(reply.result);
    };
    worker.onerror = (event) => fail(event.message || "the worker failed");
    worker.onmessageerror = () => fail("the worker's reply can't be read");
    // copies, so the page view keeps its own
    const fonts = job.fonts.map((font) => font.slice());
    const fallbacks = job.fallbacks.map(({ family, bytes }) => ({
      family,
      bytes: bytes.slice(),
    }));
    const images = job.images.map((image) => ({
      ...image,
      bytes: image.bytes.slice(),
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
});

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
    warnings: failureWarning(failures),
    pages: result.pages,
  };
};

export default toPDF;
