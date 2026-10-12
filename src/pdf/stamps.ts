import type { Mark, SavedMark } from "../signing/profile";

// A stamp placed on a PDF's page: the user's signature or initials, lines
// of text (a date, a place), or both. Blank's layout engine lays each out
// on a page of its own that is the stamp's box (`Content::Stamp` and
// `Settings::stamp` in src-tauri/layout/src/model.rs): stampEngine.ts paints
// it on screen and writes its one-page PDF, which the signer copies into
// the PDF as a Form XObject.

export interface StampSpec {
  // the user's signature or initials, contained in the box
  image?: Mark;
  // the lines under the image, in the body font
  lines: string[];
  // the size of the lines' letters, in points
  size: number;
  align: "left" | "center";
}

// the src the engine knows a mark's PNG by
export const MARK_SRC: Record<Mark, string> = {
  signature: "blank-signing:signature",
  initials: "blank-signing:initials",
};

// what a screen reader would call the image, were a stamp's text read
const MARK_ALT: Record<Mark, string> = {
  signature: "Signature",
  initials: "Initials",
};

/**
 * stampItem returns the engine's item for a stamp: its image by its mark's
 * src, with the mark's size for its shape (none while the user has none)
 */
export const stampItem = (spec: StampSpec, mark?: SavedMark | null) => {
  const image =
    spec.image && mark && mark.width > 0 && mark.height > 0
      ? {
          src: MARK_SRC[spec.image],
          width: mark.width,
          height: mark.height,
          alt: MARK_ALT[spec.image],
        }
      : { src: "", width: 0, height: 0, alt: "" };
  return {
    kind: "stamp",
    pos: 0,
    ...image,
    lines: spec.lines,
    size: spec.size,
    align: spec.align,
  };
};

/**
 * stampSettings returns the engine's settings for a stamp's page: its box,
 * `width` × `height` points, without margins or headers and footers
 */
export const stampSettings = (width: number, height: number) => ({
  width,
  height,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  stamp: true,
});

/**
 * stampKey returns what tells stamps apart: what they show, but not its
 * size, which a stamp's resize changes and its engine lays out again
 */
export const stampKey = (spec: StampSpec) =>
  JSON.stringify([spec.image ?? null, spec.lines, spec.align]);
