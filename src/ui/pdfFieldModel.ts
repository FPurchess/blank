import type { Rect as PageRect } from "../pdf/fields";
import type { PdfField } from "../pdf/ipc";
import type { Rect } from "./rect";

// What the fields of a PDF's form on its pages (PdfField.vue) work out:
// which keys stay in a field rather than going on to the page view, and
// where a radio group's buttons are.

// the keys with Ctrl or Cmd that a text field keeps: select all, copy,
// cut, paste, undo and redo of what's typed
const FIELD_KEYS = new Set(["a", "c", "x", "v", "z", "y"]);

/**
 * fieldKeyStays tells whether a key pressed in a field stays there: every
 * key without Ctrl, Cmd or Alt (typing, the arrows, Space) but Tab, which
 * moves on, and the field's own keys with Ctrl or Cmd; the rest (Save's key
 * signs) goes on to the page view
 */
export const fieldKeyStays = (event: KeyboardEvent) => {
  if (event.key === "Tab") return false;
  if (event.altKey) return false;
  if (event.ctrlKey || event.metaKey)
    return FIELD_KEYS.has(event.key.toLowerCase());
  return true;
};

/**
 * radioBoxes returns the buttons of the radio group `field` on the page
 * `page`: each one's value and where it is within the group's box `rect`
 * (points), in CSS pixels at `scale` per point
 */
export const radioBoxes = (
  field: PdfField,
  page: number,
  rect: PageRect,
  scale: number,
): { value: string; box: Rect }[] =>
  field.widgets.flatMap((widget) =>
    widget.page === page && widget.onValue
      ? [
          {
            value: widget.onValue,
            box: {
              left: (widget.rect[0] - rect[0]) * scale,
              top: (widget.rect[1] - rect[1]) * scale,
              width: widget.rect[2] * scale,
              height: widget.rect[3] * scale,
            },
          },
        ]
      : [],
  );
