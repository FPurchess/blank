import { onUnmounted } from "vue";

import { zoomStep } from "../../editor/commands/zoom";
import { useEditor } from "../../editor/handle";
import { listenOnWindow } from "../../scope";
import { zoomWheel } from "../scrollModel";

// a spot on a page, in points
interface PageSpot {
  page: number;
  x: number;
  y: number;
}

/**
 * useWheelZoom zooms the pages of a view (the page view, a PDF tab's) with
 * Ctrl and the wheel, and a pinch, which the webview sends as that, about
 * the spot under the pointer, not the webview. The listener can't be
 * passive, as it keeps the webview from zooming, and one that isn't makes
 * every scroll wait for the page; so it listens only while Ctrl is held.
 * @param spotAt the spot of the pages at a point of the view's desk, in
 *   pixels, null where there is none, or undefined while no pages show,
 *   which the wheel then doesn't zoom
 */
export const useWheelZoom = (
  scroller: () => HTMLElement | null | undefined,
  spotAt: (x: number, y: number) => PageSpot | null | undefined,
) => {
  const editor = useEditor();
  const wheelZoom = zoomWheel<WheelEvent>((direction, event) => {
    const element = scroller();
    if (!element) return;
    const box = element.getBoundingClientRect();
    const viewX = event.clientX - box.left;
    const viewY = event.clientY - box.top;
    const spot = spotAt(viewX + element.scrollLeft, viewY + element.scrollTop);
    if (spot === undefined) return;
    editor.run(zoomStep(direction, spot && { ...spot, viewX, viewY }), {
      focus: false,
    });
  });
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    wheelZoom(event);
  };
  const ctrlHeld = (event: KeyboardEvent | MouseEvent) => {
    const element = scroller();
    if (!element) return;
    if (event.ctrlKey) element.addEventListener("wheel", onWheel);
    else element.removeEventListener("wheel", onWheel);
  };
  listenOnWindow("keydown", ctrlHeld);
  listenOnWindow("keyup", ctrlHeld);
  const stopWheel = () => scroller()?.removeEventListener("wheel", onWheel);
  listenOnWindow("blur", stopWheel);
  onUnmounted(stopWheel);
  // a pinch on a touchpad comes as a wheel with Ctrl, without its key
  listenOnWindow("wheel", ctrlHeld, { capture: true, passive: true });
};
