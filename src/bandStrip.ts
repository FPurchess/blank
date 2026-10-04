import {
  type Band,
  type DocumentFields,
  formatNumber,
  hasText,
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
    { choice: "same", label: "Like the Other Pages" },
    { choice: "plain", label: "None" },
    { choice: "own", label: "Its Own" },
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
 * shows the pages whose band the edge of the window shows: those of every
 * page, or else of the first or even pages.
 */
export const openStrip = (band: Band, bands: BandSettings): Strip => {
  const own = typeof bands.firstPage === "object" ? bands.firstPage : null;
  const slots = {
    every: bands[band],
    first: own?.[band] ?? NO_SLOTS,
    even: bands.evenPages?.[band] ?? NO_SLOTS,
  };
  const firstPage = own ? "own" : (bands.firstPage as FirstPageChoice);
  const evenPages = bands.evenPages !== null;
  let pages: Pages = "every";
  if (!hasText(slots.every)) {
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
  if (pages === "first") return "First Page";
  if (pages === "even") return "Even Pages";
  return evenPages ? "Odd Pages" : "Other Pages";
};

/**
 * stripLabel names the strip: the band and, without tabs, its pages
 */
export const stripLabel = (strip: Strip) => {
  if (pagesShown(strip).length > 1) return NAMES[strip.band];
  return strip.firstPage === "plain"
    ? `${NAMES[strip.band]} · every page but the first`
    : `${NAMES[strip.band]} · every page`;
};

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
 * pageNumberMenu lists the page numbers to insert, as they read, the
 * numbering and the number of the first page
 * @param fields what the other placeholders show
 */
export const pageNumberMenu = (
  strip: Strip,
  fields: DocumentFields,
  actions: {
    insert(text: string): void;
    setNumberStyle(style: NumberStyle): void;
    setStartNumber(number: number): void;
  },
): MenuItem[] => {
  const sample = {
    ...fields,
    page: formatNumber(3, strip.numberStyle),
    pages: "12",
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
      label: `Start At ${strip.startNumber}…`,
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
