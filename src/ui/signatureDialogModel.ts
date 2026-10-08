import type { Mark, MarkSource, SavedMark } from "../signing/profile";
import { type SignatureFont, SIGNATURE_FONTS } from "../signing/fonts";

// The dialog of the user's signature or initials (SignatureDialog.vue).

export type PadTab = "draw" | "type" | "image";

export const PAD_TABS: { value: PadTab; label: string }[] = [
  { value: "draw", label: "Draw" },
  { value: "type", label: "Type" },
  { value: "image", label: "Image" },
];

/**
 * titleOf returns the dialog's title
 */
export const titleOf = (mark: Mark) =>
  mark === "signature" ? "Your signature" : "Your initials";

/**
 * initialsOf returns the initials of a name: "Ada Lovelace" gives "AL"
 */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0].toUpperCase())
    .join("");

/**
 * startOf returns what the dialog opens with: the tab the saved one was made
 * in, its strokes, its text and font
 */
export const startOf = (mark: Mark, saved: SavedMark | null, name: string) => {
  const source: MarkSource | undefined = saved?.source;
  return {
    tab: (source?.kind ?? "draw") as PadTab,
    strokes: source?.kind === "draw" ? source.strokes : [],
    text:
      source?.kind === "type"
        ? source.text
        : mark === "initials"
          ? initialsOf(name)
          : name,
    font: (source?.kind === "type"
      ? source.font
      : SIGNATURE_FONTS[0]) as SignatureFont,
  };
};

/**
 * problemOf says why there's nothing to save yet, or returns "" when there
 * is something
 */
export const problemOf = (
  tab: PadTab,
  fields: { strokes: unknown[]; text: string; image: string | null },
) => {
  if (tab === "draw" && fields.strokes.length === 0)
    return "Draw your signature first.";
  if (tab === "type" && !fields.text.trim()) return "Type your name first.";
  if (tab === "image" && !fields.image) return "Choose an image first.";
  return "";
};
