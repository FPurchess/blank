import type { Option } from "../layout/choices";

// The settings of a table of contents (TocPopover.vue).

// how deep a table of contents lists the headings: the headings 1 only, up
// to 2, … up to 6
export const DEPTH_OPTIONS: Option<number>[] = [1, 2, 3, 4, 5, 6].map(
  (depth) => ({
    value: depth,
    label: depth === 1 ? "Heading 1" : `1 – ${depth}`,
  }),
);

// the title a table of contents gets back when its field is left empty
const DEFAULT_TITLE = "Contents";

/**
 * titleOf returns the title the field `value` gives a table of contents
 */
export const titleOf = (value: string) => value.trim() || DEFAULT_TITLE;

// the settings button of the block toolbar, which they open below
export const SETTINGS_BUTTON = '#block-toolbar [data-id="block-edit"]';

/**
 * anchorOf returns what the settings open below: the toolbar's settings
 * button while it shows, or else `fallback`, the block
 */
export const anchorOf = <T extends { right: number; bottom: number }>(
  fallback: T,
) => {
  const button = document.querySelector<HTMLElement>(SETTINGS_BUTTON);
  return button && !button.closest("[hidden]")
    ? button.getBoundingClientRect()
    : fallback;
};
