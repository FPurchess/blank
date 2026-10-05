import {
  BAND_GAP,
  BAND_ROW,
  BLEED,
  type FrameLayout,
} from "../engine/frames";
import {
  BAND,
  type Band,
  bandsOn,
  formatNumber,
  pageNumber,
} from "../layout/bands";
import type { BandPart } from "../layout/placeholders";
import type { Layout } from "../layout/resolve";
import { SLOTS } from "../layout/settings";
import { segments } from "../layout/tokens";
import type { PageLayoutState } from "../state/pageView";

// What the page view shows besides the pages, see src/engine/frames.ts for
// where they are.

/**
 * endMark returns what the mark between a page and the next shows: its
 * footer, with its number when the footer doesn't show it, and the next
 * page's header
 * @param page the page, counted from 0
 * @param bands the six slots of the page's header and footer, as texts
 *   (PageEngine.bands) or as what the screen shows of them (pageBandParts),
 *   and `next` those of the next page
 * @param layout the document's page setup, which numbers the pages
 */
export const endMark = <Slot>(
  page: number,
  bands: Slot[],
  next: Slot[],
  layout: Layout,
) => {
  // the footer's settings say whether it shows the number, whatever its
  // text reads, e.g. "Chapter 2" on page 2
  const footer = bandsOn(layout, page + 1).footer;
  const shown = SLOTS.some((slot) =>
    segments(footer[slot]).some(
      (segment) => typeof segment !== "string" && segment.field === "page",
    ),
  );
  return {
    footer: bands.slice(3, 6),
    number: shown
      ? ""
      : formatNumber(pageNumber(layout, page + 1), layout.numberStyle),
    header: next.slice(0, 3),
  };
};

// in "page ends" a frame shows some room beside the text
const insetOf = (layout: FrameLayout) =>
  layout.mode === "pages" ? 0 : BLEED * layout.scale;

/**
 * firstHeaderPlace returns where the first page's header goes in "page
 * ends": right above its text, as wide as it. The sheets of "pages" show
 * it themselves.
 */
export const firstHeaderPlace = (layout: FrameLayout) => {
  const first = layout.frames[0];
  // the room the layout keeps for it, none without a header
  const room = layout.headerRoom;
  if (!first || layout.mode === "pages" || !room) return null;
  const inset = insetOf(layout);
  return {
    left: first.left + inset,
    top: first.top - room,
    width: first.width - 2 * inset,
    height: room,
  };
};

/**
 * lastFooterPlace returns where the last page's footer goes in "page ends":
 * right below its text, as wide as it, where the mark where a page ends
 * shows a footer. The sheets of "pages" show it themselves.
 */
export const lastFooterPlace = (layout: FrameLayout) => {
  const last = layout.frames[layout.frames.length - 1];
  // the room the layout keeps for it, none without a footer
  const room = layout.footerRoom;
  if (!last || layout.mode === "pages" || !room) return null;
  const inset = insetOf(layout);
  return {
    left: last.left + inset,
    top: last.top + last.height,
    width: last.width - 2 * inset,
    height: room,
  };
};

// the height of the hint that adds a header or footer
const HINT_HEIGHT = 24;

/**
 * edgeHintPlace returns where "page ends" offers to add a header above the
 * first page's text, or a footer below the last page's, while the document
 * has none, in the room the desk keeps there: right above the text, or a
 * gap below it, where the footer would show. The sheets of "pages" offer
 * it in their margins.
 */
export const edgeHintPlace = (layout: FrameLayout, band: Band) => {
  if (layout.mode === "pages") return null;
  const frame =
    band === "header"
      ? layout.frames[0]
      : layout.frames[layout.frames.length - 1];
  if (!frame) return null;
  const inset = insetOf(layout);
  return {
    left: frame.left + inset,
    top:
      band === "header"
        ? Math.max(0, frame.top - HINT_HEIGHT)
        : frame.top + frame.height + BAND_GAP,
    width: frame.width - 2 * inset,
    height: HINT_HEIGHT,
  };
};

// a band's line on a sheet, at the natural 1.3 em of IBM Plex Sans, as the
// layout engine sets it (BAND_LINE in src-tauri/layout/src/bands.rs)
const BAND_LINE = BAND.size * 1.3;

// a page's size and margins, in points
type PageSetup = Pick<PageLayoutState, "width" | "height" | "margins">;

// a box in pixels
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * bandBox returns where the engine sets a sheet's header or footer, in
 * pixels from the sheet's top left corner: as wide as the text, the header
 * `BAND.distance` below the top edge and the footer as far above the bottom
 * one, moved down by what the margin leaves beyond that and one band line
 * (band_boxes in src-tauri/layout/src/engine/display.rs)
 * @param page the size and margins of the page, in points
 * @param scale CSS pixels per point
 */
export const bandBox = (page: PageSetup, band: Band, scale: number) => {
  const { margins } = page;
  const top =
    band === "header"
      ? BAND.distance
      : page.height -
        margins.bottom +
        Math.max(0, margins.bottom - BAND.distance - BAND_LINE);
  return {
    left: margins.left * scale,
    top: top * scale,
    width: (page.width - margins.left - margins.right) * scale,
    height: BAND_LINE * scale,
    // the size of its text
    size: BAND.size * scale,
  };
};

/**
 * sheetSlots returns the slots of a sheet's header and footer that name a
 * placeholder that comes out empty, with where the engine sets them on the
 * sheet, in pixels: a third of the band's width each (bandBox). The engine
 * paints their text; the page view names the placeholders over it.
 * @param slots the six slots of the page, see pageBandParts
 * @param page the size and margins of the page, in points
 * @param scale CSS pixels per point
 */
export const sheetSlots = (
  slots: BandPart[][],
  page: PageSetup,
  scale: number,
) => {
  const boxes = {
    header: bandBox(page, "header", scale),
    footer: bandBox(page, "footer", scale),
  };
  return slots.flatMap((parts, index) => {
    if (!parts.some((part) => "field" in part)) return [];
    const slot = SLOTS[index % 3];
    const box = boxes[index < 3 ? "header" : "footer"];
    const width = box.width / 3;
    return [
      {
        key: index,
        slot,
        // a space before a name at the end of the painted text, which ends
        // where its last letter does: the name would otherwise take its
        // space
        parts: parts.map((part, at) => {
          if (!("field" in part)) return part;
          const before = parts[at - 1];
          const last = parts
            .slice(at + 1)
            .every((after) => "field" in after || !after.text.trim());
          return {
            ...part,
            spaced:
              last && !!before && "text" in before && /\s$/.test(before.text),
          };
        }),
        // the text of a slot that is only placeholders and spaces isn't
        // painted, so their names take its place as the text would; beside
        // painted text, they go where their placeholders are in it
        named: parts.every((part) => "field" in part || !part.text.trim()),
        left: box.left + width * (index % 3),
        top: box.top,
        width,
        height: box.height,
        size: box.size,
      },
    ];
  });
};

// the size of the text of the bands "page ends" shows, in pixels, at every
// scale (.page-end in main.scss)
export const PAGE_END_BAND_SIZE = 11;

/**
 * bandPlace returns where a page's header or footer is on the desk, and the
 * sheet or text it belongs to, in pixels: on the sheet in "pages" (bandBox);
 * in "page ends" the line above or below the page's text, a gap away, as the
 * marks where pages end and the first page's header and last page's footer
 * show it, also where the layout keeps no room for one yet
 * @param page the page, counted from 0
 * @param box the size and margins of the pages, in points
 */
export const bandPlace = (
  layout: FrameLayout,
  page: number,
  band: Band,
  box: PageSetup,
): { sheet: Rect; band: Rect & { size: number } } | null => {
  const frame = layout.frames[page];
  if (!frame) return null;
  const sheet = {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
  };
  if (layout.mode === "pages") {
    const placed = bandBox(box, band, layout.scale);
    return {
      sheet,
      band: {
        ...placed,
        left: frame.left + placed.left,
        top: frame.top + placed.top,
      },
    };
  }
  const inset = insetOf(layout);
  return {
    sheet,
    band: {
      left: frame.left + inset,
      top:
        band === "header"
          ? Math.max(0, frame.top - BAND_GAP - BAND_ROW)
          : frame.top + frame.height + BAND_GAP,
      width: frame.width - 2 * inset,
      height: BAND_ROW,
      size: PAGE_END_BAND_SIZE,
    },
  };
};

// how far the strip of a band keeps from it and from the window's edges
const STRIP_GAP = 8;

/**
 * stripPlace returns where the strip that edits a band goes in the window:
 * as wide as the band's sheet but within the window, beside the slots over
 * the band (slotRowPlace), below a header and above a footer, or on the
 * other side where the view has no room for it there, and inside the view
 * @param sheet the sheet and `band` the band, in the window
 * @param view the page view's box in the window
 * @param height the strip's height
 * @param windowWidth the window's width
 */
export const stripPlace = ({
  sheet,
  band,
  which,
  view,
  height,
  windowWidth,
}: {
  sheet: Rect;
  band: Rect & { size: number };
  which: Band;
  view: Rect;
  height: number;
  windowWidth: number;
}) => {
  const slots = slotRowPlace(band);
  const below = slots.top + slots.height + STRIP_GAP;
  const above = slots.top - height - STRIP_GAP;
  const highest = view.top + STRIP_GAP;
  const lowest = view.top + view.height - height - STRIP_GAP;
  const fitsBelow = below <= lowest;
  const fitsAbove = above >= highest;
  const top =
    which === "header"
      ? fitsBelow || !fitsAbove
        ? below
        : above
      : fitsAbove || !fitsBelow
        ? above
        : below;
  return {
    left: Math.max(STRIP_GAP, sheet.left),
    top: Math.max(highest, Math.min(top, lowest)),
    width: Math.min(sheet.width, windowWidth - 2 * STRIP_GAP),
  };
};

// the least height of a slot being edited, and how far it reaches beyond
// the band's text on each side
const SLOT_HEIGHT = 28;
const SLOT_BLEED = 6;

/**
 * slotRowPlace returns where the slots that edit a band go: over the band,
 * a little wider, and at least as high as a control, with its text no
 * smaller than the controls'
 * @param band the band in the window, with its text's size
 */
export const slotRowPlace = (band: Rect & { size: number }) => {
  const height = Math.max(SLOT_HEIGHT, band.height);
  return {
    left: band.left - SLOT_BLEED,
    top: band.top + (band.height - height) / 2,
    width: band.width + 2 * SLOT_BLEED,
    height,
    fontSize: Math.max(12, band.size),
  };
};

/**
 * caretLine returns where the caret at `left` is drawn: 1.5 pixels wide
 * rounded to whole device pixels, and on them, so it isn't blurred across
 * two
 * @param ratio device pixels per CSS pixel
 */
export const caretLine = (left: number, ratio: number) => {
  const width = Math.max(1, Math.round(1.5 * ratio));
  const start = Math.round(left * ratio - width / 2);
  return { left: start / ratio, width: width / ratio };
};

/**
 * pageLabel returns "Page N of M" as the bar shows it: the page in view
 * among the pages, counted from 1, whatever number the pages show, for
 * finding one's way in the document
 */
export const pageLabel = (position: { page: number; pages: number }) =>
  `Page ${position.page} of ${position.pages}`;

// a rectangle on a page, in points
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * selectedOn returns the selection's rectangles on `page` as one string,
 * e.g. "72,90,50,16", so a page shows its selection again only when that
 * string changes; "" for none
 */
export const selectedOn = (
  rects: readonly (PageBox & { page: number })[],
  page: number,
) =>
  rects
    .filter((rect) => rect.page === page)
    .map((rect) =>
      [rect.x, rect.y, rect.width, rect.height]
        .map((value) => Math.round(value * 100) / 100)
        .join(","),
    )
    .join(";");

/**
 * selectedBoxes reads the rectangles selectedOn wrote
 */
export const selectedBoxes = (selected: string): PageBox[] =>
  selected
    ? selected.split(";").map((rect) => {
        const [x, y, width, height] = rect.split(",").map(Number);
        return { x, y, width, height };
      })
    : [];

/**
 * movesPages returns whether a new layout shows the pages elsewhere on the
 * desk: in the other view, at another scale, or below more or less room
 * above the first page, e.g. for its header; typing lays out anew on every
 * key but leaves them where they are
 */
export const movesPages = (next: FrameLayout, previous: FrameLayout) =>
  next.mode !== previous.mode ||
  next.scale !== previous.scale ||
  next.headerRoom !== previous.headerRoom ||
  next.frames[0]?.top !== previous.frames[0]?.top;
