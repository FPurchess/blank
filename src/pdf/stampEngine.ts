import { engineless, newEngine, type PageEngine } from "../engine/engine";
import { fallbackFonts, findFonts } from "../engine/fallback";
import { loadedImage } from "../engine/images";
import { pdfDate } from "../engine/pdf";
import { fromDataUrl } from "../images/dataUrl";
import type { Mark } from "../signing/profile";
import { language, savedMarks } from "../state";
import { sizeCanvas } from "../ui/pageLayer";
import { paintDisplay, PAPER_COLORS } from "../ui/painter/canvas2d";
import {
  MARK_SRC,
  stampItem,
  stampKey,
  stampSettings,
  type StampSpec,
} from "./stamps";

// The stamps' engines: one for each stamp that looks different, sharing the
// page view's fonts (`newEngine`), with the user's signature and initials
// added as images. Each lays its stamp out on a page that is the stamp's
// box, which is painted on screen from its display list and written as the
// stamp's one-page PDF.

// what the user reads when a stamp can't be laid out
export const STAMPS_NEED_LAYOUT =
  "Stamps need the page layout, which isn't running. Restart Blank to place them.";

// the page a stamp is laid out on to find its own size, in points
export const NATURAL_PAGE = { width: 600, height: 200 };

interface StampEngine {
  engine: PageEngine;
  // the PNG of each mark added to it, as its data URL
  marks: Map<Mark, string>;
  // the settings and items it laid out last, as JSON
  content: string;
  // the work on it, one task after the other, since a task may wait for
  // fonts between laying out and reading what it laid out
  queue: Promise<unknown>;
}

// by stampKey
const engines = new Map<string, Promise<StampEngine>>();

/**
 * engineOf returns the engine of the stamp `spec` is, made if there's none
 */
const engineOf = (spec: StampSpec) => {
  if (engineless()) throw new Error(STAMPS_NEED_LAYOUT);
  const key = stampKey(spec);
  let made = engines.get(key);
  if (!made) {
    made = newEngine(true).then((engine) => ({
      engine,
      marks: new Map(),
      content: "",
      queue: Promise.resolve(),
    }));
    engines.set(key, made);
    // the next stamp tries again
    made.catch(() => {
      if (engines.get(key) === made) engines.delete(key);
    });
  }
  return made;
};

/**
 * onStamp runs `task` on the engine of `spec`, once it laid the stamp out
 * in a box of `width` × `height` points; an engine that failed is given up,
 * so the next stamp gets a new one
 */
const onStamp = async <T>(
  spec: StampSpec,
  width: number,
  height: number,
  task: (engine: PageEngine) => T,
): Promise<T> => {
  const made = engineOf(spec);
  const stamp = await made;
  const run = stamp.queue.then(async () => {
    const { engine } = stamp;
    if (engine.broken) throw new Error("the page layout failed before");
    const mark = spec.image ? (savedMarks.value?.[spec.image] ?? null) : null;
    if (spec.image && mark && stamp.marks.get(spec.image) !== mark.png) {
      const decoded = fromDataUrl(mark.png);
      if (decoded) {
        engine.addImage(
          MARK_SRC[spec.image],
          decoded.bytes,
          decoded.mime === "image/jpeg",
        );
        stamp.marks.set(spec.image, mark.png);
      }
    }
    const settings = stampSettings(width, height);
    const items = [stampItem(spec, mark)];
    const content = JSON.stringify([settings, items]);
    if (content !== stamp.content) {
      engine.setContent(settings, items);
      stamp.content = content;
      // fonts for what Blank's fonts lack, e.g. a place in Chinese
      const missing = engine.missing();
      if (missing) {
        await findFonts(missing, language.value);
        engine.addFonts(fallbackFonts.value);
      }
    }
    return task(engine);
  });
  stamp.queue = run.catch(() => undefined);
  try {
    return await run;
  } catch (error) {
    if (stamp.engine.broken && engines.get(stampKey(spec)) === made) {
      engines.delete(stampKey(spec));
      stamp.engine.free();
    }
    throw error;
  }
};

/**
 * naturalSize returns the size of a stamp as it lays itself out, in points:
 * its lines as wide as the widest, or its image as large as fits on
 * NATURAL_PAGE
 */
export const naturalSize = (spec: StampSpec) =>
  onStamp(spec, NATURAL_PAGE.width, NATURAL_PAGE.height, (engine) => {
    const box = engine.boxes(0, 1)[0];
    // up to a hundredth of a point, so a box of that size never breaks its
    // widest line
    const up = (value: number) => Math.ceil(value * 100) / 100;
    return box
      ? { width: up(box.width), height: up(box.height) }
      : { width: 0, height: 0 };
  });

/**
 * paintStamp paints a stamp of `box` (its size in points) into `canvas`, at
 * `scale` CSS pixels per point and the screen's pixel ratio, in the colours
 * of paper, since a PDF's page is white, over nothing
 * @returns whether all of it is painted: false while its image loads, so
 *   paint again once it did (`imagesLoaded`)
 */
export const paintStamp = (
  spec: StampSpec,
  canvas: HTMLCanvasElement,
  box: { width: number; height: number },
  scale: number,
) =>
  onStamp(spec, box.width, box.height, (engine) => {
    const ratio = window.devicePixelRatio || 1;
    sizeCanvas(
      canvas,
      Math.max(1, Math.round(box.width * scale * ratio)),
      Math.max(1, Math.round(box.height * scale * ratio)),
      ratio,
    );
    const context = canvas.getContext("2d");
    if (!context) return false;
    let complete = true;
    paintDisplay(
      context,
      engine.printDisplay(0),
      { scale, ratio, x: 0, y: 0, colors: PAPER_COLORS },
      engine,
      (src) => {
        const mark = (Object.keys(MARK_SRC) as Mark[]).find(
          (name) => MARK_SRC[name] === src,
        );
        const png = mark && savedMarks.value?.[mark]?.png;
        const loaded = png ? loadedImage(png, null) : null;
        if (!loaded) complete = false;
        return loaded?.image ?? null;
      },
    );
    return complete;
  });

/**
 * stampPdf writes a stamp as a PDF of one page, `width` × `height` points,
 * a PDF/A-2u with subsets of its fonts, which the signer copies into the
 * PDF it signs; it throws when the stamp's signature or initials aren't
 * saved, or the layout fails
 */
export const stampPdf = async (
  spec: StampSpec,
  width: number,
  height: number,
): Promise<Uint8Array> => {
  if (spec.image && !savedMarks.value?.[spec.image])
    throw new Error(`Your ${spec.image} isn't saved, so it can't be stamped`);
  return onStamp(spec, width, height, (engine) => {
    const pdf = engine.pdf("", "", undefined, pdfDate());
    if (pdf.length === 0) throw new Error("the page layout wrote no PDF");
    return pdf;
  });
};

/**
 * releaseStamp frees the engine of a stamp once it's gone, e.g. removed or
 * its tab closed; a stamp that looks the same gets a new one when it's
 * painted again
 */
export const releaseStamp = async (spec: StampSpec) => {
  const key = stampKey(spec);
  const made = engines.get(key);
  if (!made) return;
  engines.delete(key);
  const stamp = await made.catch(() => null);
  if (!stamp) return;
  await stamp.queue;
  stamp.engine.free();
};

/**
 * releaseStamps frees the engines of all stamps
 */
export const releaseStamps = async () => {
  const made = [...engines.values()];
  engines.clear();
  for (const stamp of await Promise.all(
    made.map((one) => one.catch(() => null)),
  )) {
    if (!stamp) continue;
    await stamp.queue;
    stamp.engine.free();
  }
};
