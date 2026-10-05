import {
  type Band,
  bandVariant,
  formatNumber,
  hasText,
  NO_FIELDS,
  NUMBER_PRESETS,
} from "./layout/bands";
import {
  type Bands,
  type BandSettings,
  NO_BANDS,
  NO_SLOTS,
  type NumberStyle,
  type Slots,
} from "./layout/settings";
import { expand } from "./layout/tokens";
import type { MenuItem } from "./state";

// The open header or footer strip without its DOM: what it edits, which
// pages it shows, its menus, and what it keeps when it closes.
// src/ui/BandEditor.vue renders it; the functions here return a new strip.

// the pages a strip edits the band of: the first page when it has its own,
// every page, or even pages when they have their own
export type Pages = "first" | "every" | "even";

// what the first page has: the same as the others, none, or its own
export type FirstPageChoice = "same" | "plain" | "own";

export interface Strip {
  band: Band;
  // the band on each of the pages
  slots: Record<Pages, Slots>;
  firstPage: FirstPageChoice;
  // whether even pages have their own
  evenPages: boolean;
  numberStyle: NumberStyle;
  startNumber: number;
  // the pages whose band is shown
  pages: Pages;
}

// what a band is called on its strip and its edge
export const NAMES: Record<Band, string> = {
  header: "Header",
  footer: "Footer",
};

export const NUMBER_STYLES: { style: NumberStyle; label: string }[] = [
  { style: "1", label: "1, 2, 3" },
  { style: "i", label: "i, ii, iii" },
  { style: "I", label: "I, II, III" },
];

export const FIRST_PAGE_CHOICES: { choice: FirstPageChoice; label: string }[] =
  [
    { choice: "same", label: "The same as the others" },
    { choice: "plain", label: "None" },
    { choice: "own", label: "Its own" },
  ];

/**
 * mirror swaps the left and right of slots, for even pages, whose outer
 * edge is on the left
 */
export const mirror = ({ left, center, right }: Slots): Slots => ({
  left: right,
  center,
  right: left,
});

/**
 * openStrip returns the strip of `band` for the settings as they are. It
 * shows the band of `page` (counted from 1): the first page's own, that of
 * even pages, or that of every page, also on a first page without one.
 * Without a page, e.g. without the layout engine, it shows that of every
 * page, or else of the first or even pages, whichever has text.
 */
export const openStrip = (
  band: Band,
  bands: BandSettings,
  page: number | null,
): Strip => {
  const own = typeof bands.firstPage === "object" ? bands.firstPage : null;
  const slots = {
    every: bands[band],
    first: own?.[band] ?? NO_SLOTS,
    even: bands.evenPages?.[band] ?? NO_SLOTS,
  };
  const firstPage = own ? "own" : (bands.firstPage as FirstPageChoice);
  const evenPages = bands.evenPages !== null;
  let pages: Pages = "every";
  if (page !== null) {
    const variant = bandVariant(bands, page);
    if (variant === "first" || variant === "even") pages = variant;
  } else if (!hasText(slots.every)) {
    if (own && hasText(slots.first)) pages = "first";
    else if (evenPages && hasText(slots.even)) pages = "even";
  }
  const { numberStyle, startNumber } = bands;
  return { band, slots, firstPage, evenPages, numberStyle, startNumber, pages };
};

/**
 * pagesShown returns the pages that have a band of their own, which the
 * strip shows as tabs where there are more than one
 */
export const pagesShown = ({ firstPage, evenPages }: Strip): Pages[] => [
  ...(firstPage === "own" ? (["first"] as const) : []),
  "every",
  ...(evenPages ? (["even"] as const) : []),
];

/**
 * tabLabel names the tab of the pages
 */
export const tabLabel = ({ evenPages }: Strip, pages: Pages) => {
  if (pages === "first") return "First page";
  if (pages === "even") return "Even pages";
  return evenPages ? "Odd pages" : "All pages";
};

/**
 * bandSummary says on which pages the band is, beside its name
 */
export const bandSummary = ({ firstPage, evenPages }: Strip) =>
  [
    firstPage === "plain" && "not on the first page",
    firstPage === "own" && "its own on the first page",
    evenPages && "odd and even pages differ",
  ]
    .filter(Boolean)
    .join(" · ") || "on every page";

/**
 * firstPageLabel returns what the first page has, as its button shows it
 */
export const firstPageLabel = ({ firstPage }: Strip) =>
  FIRST_PAGE_CHOICES.find(({ choice }) => choice === firstPage)!.label;

/**
 * withSlots keeps what the slots shown hold
 */
export const withSlots = (strip: Strip, slots: Slots): Strip => ({
  ...strip,
  slots: { ...strip.slots, [strip.pages]: slots },
});

/**
 * showPages shows the band of other pages
 */
export const showPages = (strip: Strip, pages: Pages): Strip => ({
  ...strip,
  pages,
});

/**
 * chooseFirstPage sets what the first page has, and shows its band when it
 * has its own, or the other pages' when it no longer has
 */
export const chooseFirstPage = (
  strip: Strip,
  firstPage: FirstPageChoice,
): Strip => ({
  ...strip,
  firstPage,
  pages:
    firstPage === "own"
      ? "first"
      : strip.pages === "first"
        ? "every"
        : strip.pages,
});

/**
 * toggleEvenPages gives even pages their own band, which starts as the odd
 * pages' mirrored, so the page numbers are on the outside, or takes it away
 */
export const toggleEvenPages = (strip: Strip): Strip => {
  const evenPages = !strip.evenPages;
  if (!evenPages) {
    return {
      ...strip,
      evenPages,
      pages: strip.pages === "even" ? "every" : strip.pages,
    };
  }
  const even = hasText(strip.slots.even)
    ? strip.slots.even
    : mirror(strip.slots.every);
  return {
    ...strip,
    evenPages,
    slots: { ...strip.slots, even },
    pages: "even",
  };
};

/**
 * mirrorOddPages gives even pages the band of the odd ones, mirrored
 */
export const mirrorOddPages = (strip: Strip): Strip => ({
  ...strip,
  slots: { ...strip.slots, even: mirror(strip.slots.every) },
});

/**
 * removeBand clears the band on every page
 */
export const removeBand = (strip: Strip): Strip => ({
  ...strip,
  slots: { every: NO_SLOTS, first: NO_SLOTS, even: NO_SLOTS },
});

/**
 * stripSettings returns the settings the strip leaves: its band on each of
 * the pages, next to the other band as it was. A first page of its own
 * without a header and footer has none.
 * @param initial the settings the strip opened with
 */
export const stripSettings = (
  strip: Strip,
  initial: BandSettings,
): BandSettings => {
  const withOther = (edited: Slots, bands: Bands | null): Bands => ({
    ...(bands ?? NO_BANDS),
    [strip.band]: edited,
  });
  const own = withOther(
    strip.slots.first,
    typeof initial.firstPage === "object" ? initial.firstPage : null,
  );
  const firstPage =
    strip.firstPage !== "own"
      ? strip.firstPage
      : hasText(own.header) || hasText(own.footer)
        ? own
        : "plain";
  return {
    ...initial,
    [strip.band]: strip.slots.every,
    firstPage,
    evenPages: strip.evenPages
      ? withOther(strip.slots.even, initial.evenPages)
      : null,
    numberStyle: strip.numberStyle,
    startNumber: strip.startNumber,
  };
};

/**
 * firstPageMenu lists what the first page can have
 * @param choose what choosing one does
 */
export const firstPageMenu = (
  strip: Strip,
  choose: (choice: FirstPageChoice) => void,
): MenuItem[] =>
  FIRST_PAGE_CHOICES.map(({ choice, label }) => ({
    id: `first-page:${choice}`,
    label,
    checked: choice === strip.firstPage,
    radio: true,
    run: () => choose(choice),
  }));

// a first page number as typed, undefined for anything else
const readStartNumber = (typed: string) => {
  const number = Number(typed.trim());
  return typed.trim() !== "" && Number.isInteger(number) && number >= 0
    ? number
    : undefined;
};

/**
 * pageNumberMenu lists the page numbers to insert, as they read on the
 * first of two pages, the numbering and the number of the first page
 */
export const pageNumberMenu = (
  strip: Strip,
  actions: {
    insert(text: string): void;
    setNumberStyle(style: NumberStyle): void;
    setStartNumber(number: number): void;
  },
): MenuItem[] => {
  const sample = {
    ...NO_FIELDS,
    page: formatNumber(1, strip.numberStyle),
    pages: "2",
    chapter: "",
  };
  return [
    ...NUMBER_PRESETS.map((preset) => ({
      id: preset,
      label: expand(preset, sample),
      run: () => actions.insert(preset),
    })),
    "separator",
    ...NUMBER_STYLES.map(({ style, label }) => ({
      id: `number-style:${style}`,
      label,
      checked: style === strip.numberStyle,
      radio: true,
      run: () => actions.setNumberStyle(style),
    })),
    "separator",
    {
      id: "start-number",
      label: `Start at ${strip.startNumber}…`,
      edit: {
        value: String(strip.startNumber),
        submit: (typed) => {
          const number = readStartNumber(typed);
          if (number !== undefined) actions.setStartNumber(number);
        },
      },
    },
  ];
};
