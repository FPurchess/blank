import type { Command } from "prosemirror-state";

import { engineless } from "../../engine/engine";
import { zoomAnchorNow } from "../../engine/geometry";
import {
  announce,
  pageZoom,
  type PageZoom,
  ZOOM_NEEDS_PAGES,
  ZOOM_STEPS,
  zoomAnchor,
  type ZoomAnchor,
  zoomFactor,
  zoomLabel,
} from "../../state";

// The zoom of the pages, see .claude/rules/layout-engine.md, "Zoom".

// how far a factor may be off a step and still count as it, e.g. Fit's
const NEAR = 0.001;

/**
 * nextZoom returns the step after `factor` in `direction`, or the first or
 * last step if there is none
 */
export const nextZoom = (factor: number, direction: 1 | -1) => {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const next = steps.find((step) =>
    direction > 0 ? step > factor + NEAR : step < factor - NEAR,
  );
  return next ?? steps[steps.length - 1];
};

/**
 * setZoom shows the pages at `zoom`, keeping `anchor` where it is in the
 * view, and says the zoom it's at; at the end of the steps, it says so
 */
const setZoom =
  (zoom: PageZoom, anchor: ZoomAnchor | null): Command =>
  (_state, dispatch) => {
    if (!dispatch) return true;
    if (engineless()) {
      announce(ZOOM_NEEDS_PAGES);
      return true;
    }
    if (zoom === pageZoom.value && zoom !== "fit") {
      announce(`The zoom is at ${zoomLabel(zoom, zoom).text}`);
      return true;
    }
    zoomAnchor.value = anchor;
    pageZoom.value = zoom;
    announce(zoomLabel(zoom, zoomFactor.value).spoken);
    return true;
  };

/**
 * zoomStep zooms the pages one step in (1) or out (-1), from the zoom they
 * show at, Fit's too, keeping `anchor` where it is, e.g. the spot under the
 * pointer
 */
export const zoomStep =
  (direction: 1 | -1, anchor: ZoomAnchor | null): Command =>
  (state, dispatch) =>
    setZoom(nextZoom(zoomFactor.value, direction), anchor)(state, dispatch);

/**
 * zoomBy zooms the pages one step in (1) or out (-1), keeping the caret where
 * it is if it's in view, else the middle of the view
 */
export const zoomBy =
  (direction: 1 | -1): Command =>
  (state, dispatch) =>
    zoomStep(direction, dispatch ? zoomAnchorNow() : null)(state, dispatch);

/**
 * zoomFit shows the pages as wide as the view allows
 */
export const zoomFit = (): Command => (state, dispatch) =>
  setZoom("fit", dispatch ? zoomAnchorNow() : null)(state, dispatch);
