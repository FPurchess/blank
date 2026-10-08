// Scrolling what doesn't fit: the page view, the outline, the tabs.

export { scrollFor } from "../scroll";

/**
 * wheelPixels returns how far a wheel turn scrolls, in pixels
 * @param viewHeight the size of what scrolls, for a turn by pages
 */
export const wheelPixels = (
  { deltaY, deltaMode }: Pick<WheelEvent, "deltaY" | "deltaMode">,
  viewHeight: number,
) =>
  deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * viewHeight
      : deltaY;

// how far a touchpad's pinch, or a smooth wheel, goes for one step of zoom,
// in pixels, and how long it rests before a new gesture starts
const ZOOM_PIXELS = 50;
const ZOOM_REST = 200;

/**
 * zoomWheel returns what handles the wheel while Ctrl is held: a notch of a
 * wheel zooms one step, in or out (`step` gets 1 or -1), and the small
 * turns a pinch or a smooth wheel sends add up to steps
 */
export const zoomWheel = <
  E extends Pick<WheelEvent, "deltaY" | "deltaMode" | "timeStamp">,
>(
  step: (direction: 1 | -1, event: E) => void,
) => {
  let pending = 0;
  let last = -Infinity;
  return (event: E) => {
    if (event.timeStamp - last > ZOOM_REST) pending = 0;
    last = event.timeStamp;
    // up zooms in
    const pixels = -wheelPixels(event, 1);
    if (event.deltaMode !== 0 || Math.abs(pixels) >= ZOOM_PIXELS) {
      pending = 0;
      if (pixels !== 0) step(pixels > 0 ? 1 : -1, event);
      return;
    }
    pending += pixels;
    if (Math.abs(pending) < ZOOM_PIXELS) return;
    step(pending > 0 ? 1 : -1, event);
    pending = 0;
  };
};
