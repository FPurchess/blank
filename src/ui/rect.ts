// A box of the UI in pixels, e.g. where a handle or the slots of a header
// go, and the inline style that puts an element there.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * styleOf returns the inline style that puts an element at `box`, as high
 * as its content without a height
 */
export const styleOf = (
  box: (Omit<Rect, "height"> & { height?: number }) | null,
) =>
  box
    ? {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        ...(box.height !== undefined && { height: `${box.height}px` }),
      }
    : undefined;
