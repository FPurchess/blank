import type { Attrs } from "prosemirror-model";

import { formatMarker, type Marker, parseMarker } from "./args";

// The content blocks that are one marker line, and the node each becomes:
// how its marker's arguments read into the node's attributes and back.
// Arguments a block doesn't know are kept in `extra` and written after the
// ones it knows, so a newer Blank's arguments aren't lost.

export interface AtomSpec {
  // the version of the marker's syntax this Blank reads and writes
  format: number;
  // the node type
  node: string;
  // the arguments it knows, in the order they're written
  order: readonly string[];
  // the node's attributes, or null if the arguments make no sense
  read: (args: Record<string, string>) => Attrs | null;
  write: (attrs: Attrs) => Record<string, string>;
}

/**
 * extraArgs returns the arguments not in `order`, as a marker can hold them:
 * strings, under names a marker can have
 */
export const extraArgs = (args: unknown, order: readonly string[]) =>
  Object.fromEntries(
    Object.entries(
      args && typeof args === "object" && !Array.isArray(args) ? args : {},
    ).filter(
      ([key, value]) =>
        !order.includes(key) &&
        /^[a-z][a-z0-9-]*$/.test(key) &&
        typeof value === "string",
    ),
  ) as Record<string, string>;

const TOC_ARGS = ["depth", "title"] as const;

// a table of contents as it starts: the headings 1 to 3, under "Contents"
export const TOC_DEFAULTS = { depth: 3, title: "Contents" } as const;

/**
 * isDepth tells whether a table of contents can list headings `depth` levels
 * deep
 */
export const isDepth = (depth: unknown): depth is number =>
  Number.isInteger(depth) && (depth as number) >= 1 && (depth as number) <= 6;

const SIGNATURE_ARGS = ["role", "name", "place", "date", "width"] as const;

// when a signature block's date is filled in: when it is signed, never (a
// line to write it by hand), or a date fixed in the file, as YYYY-MM-DD
export type SignatureDate =
  "signing" | "none" | `${number}-${number}-${number}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHARE = /^(?:[1-9]\d?|100)%$/;

/**
 * calendarDate returns the day a YYYY-MM-DD date is, at noon local time, or
 * null for what isn't one, e.g. "2026-02-30"
 */
export const calendarDate = (value: string) => {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
};

/**
 * isSignatureDate tells whether `value` is a date a signature block can say
 */
const isSignatureDate = (value: unknown): value is SignatureDate =>
  value === "signing" ||
  value === "none" ||
  (typeof value === "string" && calendarDate(value) !== null);

// a signature block as it starts: one line to sign, dated when signed
export const SIGNATURE_DEFAULTS = {
  role: "",
  name: "",
  place: "",
  date: "signing",
  width: null,
} as const;

export const ATOMS: Record<string, AtomSpec> = {
  // a table of contents: the headings up to `depth`, under `title`
  toc: {
    format: 1,
    node: "toc",
    order: TOC_ARGS,
    read: (args) => {
      const depth =
        args.depth === undefined
          ? TOC_DEFAULTS.depth
          : /^\d$/.test(args.depth)
            ? Number(args.depth)
            : NaN;
      if (!isDepth(depth)) return null;
      return {
        depth,
        title: args.title ?? TOC_DEFAULTS.title,
        extra: extraArgs(args, TOC_ARGS),
      };
    },
    write: (attrs) => ({
      ...extraArgs(attrs.extra, TOC_ARGS),
      depth: String(attrs.depth),
      title: attrs.title as string,
    }),
  },
  // a line for one person to sign on: who (`name`, empty for whoever
  // signs) and as what (`role`), where (`place`, empty for where they sign)
  // and when (`date`), as wide as `width` says of the text's
  signature: {
    format: 1,
    node: "signature",
    order: SIGNATURE_ARGS,
    read: (args) => {
      // a paste's arguments come from JSON, which may hold anything
      const known = args as Record<string, unknown>;
      if (
        SIGNATURE_ARGS.some(
          (key) => known[key] !== undefined && typeof known[key] !== "string",
        )
      ) {
        return null;
      }
      const date = args.date ?? SIGNATURE_DEFAULTS.date;
      const width = args.width ?? null;
      if (!isSignatureDate(date) || (width !== null && !SHARE.test(width))) {
        return null;
      }
      return {
        role: args.role ?? "",
        name: args.name ?? "",
        place: args.place ?? "",
        date,
        width,
        extra: extraArgs(args, SIGNATURE_ARGS),
      };
    },
    // what is empty or as it starts is left out
    write: (attrs) =>
      Object.fromEntries(
        Object.entries({
          ...extraArgs(attrs.extra, SIGNATURE_ARGS),
          role: attrs.role as string,
          name: attrs.name as string,
          place: attrs.place as string,
          date:
            attrs.date === SIGNATURE_DEFAULTS.date
              ? ""
              : (attrs.date as string),
          width: (attrs.width as string | null) ?? "",
        }).filter(([, value]) => value !== ""),
      ),
  },
};

/**
 * formatAtom writes the marker line of a block of one line, see ATOMS
 */
export const formatAtom = (name: string, attrs: Attrs) => {
  const atom = ATOMS[name];
  return formatMarker(
    { name, format: atom.format, args: atom.write(attrs) },
    atom.order,
  );
};

/**
 * atomOf returns the spec of the block of one line `marker` opens, if Blank
 * knows its name and format: it never pairs with a closing marker
 */
export const atomOf = (marker: Marker | null) => {
  const atom = marker && !marker.close ? ATOMS[marker.name] : undefined;
  return atom && marker?.format === atom.format ? atom : undefined;
};

/**
 * readAtom reads the marker line of a block of one line into the type of its
 * node and its attributes, or returns null if Blank can't read it
 */
export const readAtom = (line: string) => {
  const marker = parseMarker(line.trim());
  const attrs = atomOf(marker)?.read(marker!.args);
  return attrs ? { node: atomOf(marker)!.node, attrs } : null;
};
