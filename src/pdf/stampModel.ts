import type { PageSize } from "../engine/frames";
import type { Mark } from "../signing/profile";
import type { Rect } from "./fields";
import type { StampSpec } from "./stamps";

// The stamps placed on a PDF's pages, and what the keys and the mouse do to
// them (see .claude/rules/pdf.md, "Stamps"): place, move, nudge, resize with
// the aspect kept, remove, repeat initials on every page, and an undo
// history of whole snapshots. Pure: the shown tab's stamps are kept by
// stampBooks.ts, painted by StampOverlay.vue. Rects are display points, `[x,
// y, width, height]` from the top left of the page as it shows.

export type StampKind = "signature" | "initials" | "date" | "place";

export const STAMP_KINDS: readonly StampKind[] = [
  "signature",
  "initials",
  "date",
  "place",
];

export interface Stamp {
  readonly id: string;
  readonly kind: StampKind;
  // the page, from 0
  readonly page: number;
  readonly rect: Rect;
  // the size it was placed at, which a resize keeps 50–300 % of and whose
  // shape it keeps
  readonly natural: readonly [number, number];
  // initials on every page, at the same spot (clamped into smaller pages)
  readonly repeat?: boolean;
  // the found place or field it fills, if it was placed on one
  readonly place?: string;
  // what it shows, at its natural size (`scaledSpec` for its size now)
  readonly spec: StampSpec;
}

// how much of a stamp stays on its page, at least, in points
export const MIN_ON_PAGE = 10;
// a resize's bounds, as shares of the natural size
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
// how far the keys move or resize, in points, and with Shift
export const STEP = 1;
export const BIG_STEP = 10;
// the room between a signature and the date or place below it, and from
// the page's edges for initials, in points
export const GAP = 6;
export const EDGE = 36;
// the size of the lines of a date or place, in points
export const LINE_SIZE = 11;
// the box a signature or initials is contained in when placed freely
export const MARK_BOX: Record<Mark, readonly [number, number]> = {
  signature: [180, 60],
  initials: [56, 28],
};

// what a stamp is called, for the screen reader and the announcements
export const STAMP_NAMES: Record<StampKind, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  place: "Place",
};

/**
 * stampSpec returns what a stamp of `kind` shows: the user's signature or
 * initials, or one line of text (the date, the place)
 */
export const stampSpec = (kind: StampKind, line = ""): StampSpec =>
  kind === "signature" || kind === "initials"
    ? { image: kind, lines: [], size: LINE_SIZE, align: "center" }
    : { lines: [line], size: LINE_SIZE, align: "left" };

/**
 * markSize returns the size of a signature or initials placed freely: its
 * picture's shape (`width` × `height` pixels) contained in its MARK_BOX
 */
export const markSize = (
  mark: Mark,
  width: number,
  height: number,
): [number, number] => {
  const [boxWidth, boxHeight] = MARK_BOX[mark];
  if (!(width > 0 && height > 0)) return [boxWidth, boxHeight];
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const round = (value: number) => Math.round(value * 100) / 100;
  return [round(width * scale), round(height * scale)];
};

/**
 * scaleOf returns how large `stamp` is now, as a share of its natural size
 */
export const scaleOf = (stamp: Stamp) =>
  stamp.natural[0] > 0 ? stamp.rect[2] / stamp.natural[0] : 1;

/**
 * scaledSpec returns what `stamp` shows at its size now: its letters as
 * much larger as it is
 */
export const scaledSpec = (stamp: Stamp): StampSpec => ({
  ...stamp.spec,
  size: stamp.spec.size * scaleOf(stamp),
});

/**
 * clampRect moves `rect` so at least MIN_ON_PAGE points of it stay on a
 * page of `page`, both ways
 */
export const clampRect = (rect: Rect, page: PageSize): Rect => {
  const [x, y, w, h] = rect;
  const keep = (at: number, size: number, room: number) => {
    const least = Math.min(MIN_ON_PAGE, size, room);
    return Math.min(Math.max(at, least - size), room - least);
  };
  return [keep(x, w, page.width), keep(y, h, page.height), w, h];
};

/**
 * fitInto moves `rect` into a page of `page`, made smaller with its shape
 * kept if it doesn't fit, as a repeated stamp is drawn on smaller pages
 * (`clamp` in src-tauri/src/signing/pdf/stamp.rs)
 */
export const fitInto = (rect: Rect, page: PageSize): Rect => {
  let [x, y, w, h] = rect;
  const scale = Math.min(page.width / w, page.height / h, 1);
  w *= scale;
  h *= scale;
  x = Math.max(0, Math.min(x, page.width - w));
  y = Math.max(0, Math.min(y, page.height - h));
  return [x, y, w, h];
};

/**
 * moveTo returns `stamp` with its top left at `x`, `y`, kept on its page
 */
export const moveTo = (
  stamp: Stamp,
  x: number,
  y: number,
  page: PageSize,
): Stamp => ({
  ...stamp,
  rect: clampRect([x, y, stamp.rect[2], stamp.rect[3]], page),
});

/**
 * nudge returns `stamp` moved `dx`, `dy` points, kept on its page
 */
export const nudge = (
  stamp: Stamp,
  dx: number,
  dy: number,
  page: PageSize,
): Stamp => moveTo(stamp, stamp.rect[0] + dx, stamp.rect[1] + dy, page);

// a corner of a stamp: the one a resize leaves where it is is the opposite
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * resizeTo returns `stamp` `width` points wide, its shape kept, within 50 %
 * and 300 % of its natural size, with the corner `fixed` where it was
 */
export const resizeTo = (
  stamp: Stamp,
  width: number,
  page: PageSize,
  fixed: Corner = "top-left",
): Stamp => {
  const [naturalWidth, naturalHeight] = stamp.natural;
  const next = Math.min(
    naturalWidth * MAX_SCALE,
    Math.max(naturalWidth * MIN_SCALE, width),
  );
  const height = naturalWidth > 0 ? (next * naturalHeight) / naturalWidth : 0;
  const [x, y, w, h] = stamp.rect;
  const left = fixed.endsWith("left") ? x : x + w - next;
  const top = fixed.startsWith("top") ? y : y + h - height;
  return { ...stamp, rect: clampRect([left, top, next, height], page) };
};

/**
 * resizeBy returns `stamp` `by` points wider (narrower for a negative
 * `by`), its top left where it was
 */
export const resizeBy = (stamp: Stamp, by: number, page: PageSize): Stamp =>
  resizeTo(stamp, stamp.rect[2] + by, page);

/**
 * withStamp returns `stamps` with `stamp` in place of the one of its id, or
 * added at the end
 */
export const withStamp = (
  stamps: readonly Stamp[],
  stamp: Stamp,
): readonly Stamp[] =>
  stamps.some((one) => one.id === stamp.id)
    ? stamps.map((one) => (one.id === stamp.id ? stamp : one))
    : [...stamps, stamp];

/**
 * withoutStamp returns `stamps` without the one `id`
 */
export const withoutStamp = (stamps: readonly Stamp[], id: string) =>
  stamps.filter((stamp) => stamp.id !== id);

/**
 * toggleRepeat returns `stamps` with the initials `id` on every page, or
 * only on their own again; other stamps don't repeat
 */
export const toggleRepeat = (
  stamps: readonly Stamp[],
  id: string,
): readonly Stamp[] =>
  stamps.map((stamp) =>
    stamp.id === id && stamp.kind === "initials"
      ? { ...stamp, repeat: !stamp.repeat }
      : stamp,
  );

/**
 * readingOrder returns `stamps` as they're read: by page, then from the top,
 * then from the left, which the DOM and so Tab follow
 */
export const readingOrder = (stamps: readonly Stamp[]): readonly Stamp[] =>
  [...stamps].sort(
    (a, b) => a.page - b.page || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0],
  );

// a repeated stamp as it shows on a page other than its own
export interface Ghost {
  stamp: Stamp;
  page: number;
  rect: Rect;
}

/**
 * ghostsOf returns the repeated initials of `stamps` on the pages of
 * `sizes` other than their own, fitted into smaller pages
 */
export const ghostsOf = (
  stamps: readonly Stamp[],
  sizes: readonly PageSize[],
): Ghost[] =>
  stamps
    .filter((stamp) => stamp.repeat && stamp.kind === "initials")
    .flatMap((stamp) =>
      sizes.flatMap((size, page) =>
        page === stamp.page
          ? []
          : [{ stamp, page, rect: fitInto(stamp.rect, size) }],
      ),
    );

// the part of a page that shows, in points from its top: where a stamp
// placed from the keyboard goes
export interface Shown {
  top: number;
  height: number;
}

/**
 * defaultSpot returns where a stamp of `kind`, `size` points large, goes on
 * the page `page` of `sizes` when it's placed from the keyboard (§4.4):
 * a signature centred in the lower third of what shows of the page;
 * initials at its bottom right; a date or place below the last signature
 * stamp (and what was placed below it already), else as a signature
 */
export const defaultSpot = (
  kind: StampKind,
  size: readonly [number, number],
  page: number,
  sizes: readonly PageSize[],
  shown: Shown,
  stamps: readonly Stamp[],
): { page: number; rect: Rect } => {
  const [w, h] = size;
  const on = (at: number, rect: Rect) => ({
    page: at,
    rect: clampRect(rect, sizes[at]),
  });
  const pageSize = sizes[page];
  if (kind === "initials")
    return on(page, [
      pageSize.width - w - EDGE,
      pageSize.height - h - EDGE,
      w,
      h,
    ]);
  const signature = [...stamps]
    .reverse()
    .find((stamp) => stamp.kind === "signature");
  if (kind !== "signature" && signature) {
    // what stands below it already: dates and places under its left edge
    let bottom = signature.rect[1] + signature.rect[3];
    for (const stamp of readingOrder(stamps)) {
      if (
        stamp.page === signature.page &&
        (stamp.kind === "date" || stamp.kind === "place") &&
        Math.abs(stamp.rect[0] - signature.rect[0]) < 1 &&
        stamp.rect[1] >= bottom - 1 &&
        stamp.rect[1] <= bottom + GAP + 1
      )
        bottom = stamp.rect[1] + stamp.rect[3];
    }
    return on(signature.page, [signature.rect[0], bottom + GAP, w, h]);
  }
  const third = shown.height / 3;
  return on(page, [
    (pageSize.width - w) / 2,
    shown.top + 2 * third + (third - h) / 2,
    w,
    h,
  ]);
};

/**
 * spotAt returns where a stamp `size` points large goes when it's placed
 * with a click at `x`, `y` on a page of `page`: centred on the click
 */
export const spotAt = (
  size: readonly [number, number],
  x: number,
  y: number,
  page: PageSize,
): Rect =>
  clampRect([x - size[0] / 2, y - size[1] / 2, size[0], size[1]], page);

// The undo history of a tab's stamps: snapshots, at most HISTORY deep

export const HISTORY = 100;
// nudges of one stamp this close together are one step, in ms
export const NUDGE_RUN = 500;

export interface StampBook {
  readonly stamps: readonly Stamp[];
  readonly past: readonly (readonly Stamp[])[];
  readonly future: readonly (readonly Stamp[])[];
  // the last nudge, which the next one of the same stamp may join
  readonly nudged: { readonly id: string; readonly at: number } | null;
}

export const EMPTY_BOOK: StampBook = {
  stamps: [],
  past: [],
  future: [],
  nudged: null,
};

/**
 * bookOf returns a book of `stamps`, with no history, e.g. restored ones
 */
export const bookOf = (stamps: readonly Stamp[]): StampBook => ({
  ...EMPTY_BOOK,
  stamps,
});

/**
 * changed returns `book` with `stamps` as one more step, or, for a nudge
 * of the stamp the last step nudged less than NUDGE_RUN before, in that
 * step
 * @param nudge the stamp a nudge moved and when, for a nudge
 */
export const changed = (
  book: StampBook,
  stamps: readonly Stamp[],
  nudge?: { id: string; at: number },
): StampBook => {
  if (stamps === book.stamps) return book;
  const joins =
    nudge !== undefined &&
    book.nudged?.id === nudge.id &&
    nudge.at - book.nudged.at < NUDGE_RUN &&
    book.past.length > 0;
  return {
    stamps,
    past: joins ? book.past : [...book.past, book.stamps].slice(-HISTORY),
    future: [],
    nudged: nudge ?? null,
  };
};

/**
 * undone returns `book` a step back, or `book` with nothing to undo
 */
export const undone = (book: StampBook): StampBook => {
  const previous = book.past[book.past.length - 1];
  if (!previous) return book;
  return {
    stamps: previous,
    past: book.past.slice(0, -1),
    future: [book.stamps, ...book.future],
    nudged: null,
  };
};

/**
 * redone returns `book` a step forward again, or `book` with nothing to
 * redo
 */
export const redone = (book: StampBook): StampBook => {
  const next = book.future[0];
  if (!next) return book;
  return {
    stamps: next,
    past: [...book.past, book.stamps].slice(-HISTORY),
    future: book.future.slice(1),
    nudged: null,
  };
};

/**
 * onPages returns the stamps of `stamps` on the pages a PDF of `count`
 * pages has, e.g. once it changed on the disk
 */
export const onPages = (stamps: readonly Stamp[], count: number) =>
  stamps.filter((stamp) => stamp.page < count);

/**
 * stampLabel names `stamp` for a screen reader, e.g. "Signature on page 2,
 * selected"
 */
export const stampLabel = (stamp: Stamp, selected: boolean) =>
  `${STAMP_NAMES[stamp.kind]} on page ${stamp.page + 1}${
    stamp.repeat ? " and every other page" : ""
  }${selected ? ", selected" : ""}`;

/**
 * isStamp tells whether `value` is a stamp as stored (`stamps:<id>`)
 */
export const isStamp = (value: unknown): value is Stamp => {
  const stamp = value as Stamp | null;
  const numbers = (list: unknown, length: number) =>
    Array.isArray(list) &&
    list.length === length &&
    list.every((n) => typeof n === "number" && Number.isFinite(n));
  return (
    typeof stamp?.id === "string" &&
    STAMP_KINDS.includes(stamp.kind) &&
    Number.isInteger(stamp.page) &&
    stamp.page >= 0 &&
    numbers(stamp.rect, 4) &&
    numbers(stamp.natural, 2) &&
    typeof stamp.spec === "object" &&
    stamp.spec !== null &&
    Array.isArray(stamp.spec.lines) &&
    stamp.spec.lines.every((line) => typeof line === "string") &&
    typeof stamp.spec.size === "number"
  );
};
