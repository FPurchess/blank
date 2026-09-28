import type { pageGeometry } from "../../layout/resolve";
import { SLOTS, type Slots } from "../../layout/settings";
import { expand, type Field } from "../../layout/tokens";
import { BAND, hasText } from "../../layout/bands";
import { withFallback } from "./fallback";

// The header and footer of a page of the PDF: three columns in the margin,
// on the left, in the center and on the right, like Word's tab stops.

// the line height of a band, at pdfmake's natural 1.3em
const LINE = BAND.size * 1.3;

/**
 * bandBlock returns the header or footer of a page for pdfmake, or null for
 * none. pdfmake gives it the page's margin above or below the text.
 * @param slots the text of the band
 * @param values what the placeholders stand for on this page
 * @param geometry the page
 * @param where the header, BAND.distance below the top edge, or the footer,
 *   whose line ends BAND.distance above the bottom edge
 */
export const bandBlock = (
  slots: Slots,
  values: Record<Field, string>,
  { margins }: ReturnType<typeof pageGeometry>,
  where: "header" | "footer",
) => {
  if (!hasText(slots)) return null;
  const top =
    where === "header"
      ? BAND.distance
      : Math.max(0, margins.bottom - BAND.distance - LINE);
  return {
    columns: SLOTS.map((slot) => ({
      text: withFallback(expand(slots[slot], values), {}),
      alignment: slot,
      width: "*",
    })),
    margin: [margins.left, top, margins.right, 0],
    fontSize: BAND.size,
    color: BAND.color,
    lineHeight: 1,
  };
};
