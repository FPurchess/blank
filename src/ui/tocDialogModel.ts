import type { Option } from "../layout/choices";

// how deep a table of contents lists the headings: the headings 1 only, up
// to 2, … up to 6
export const DEPTH_OPTIONS: Option<number>[] = [1, 2, 3, 4, 5, 6].map(
  (depth) => ({
    value: depth,
    label: depth === 1 ? "Heading 1" : `1 – ${depth}`,
  }),
);
