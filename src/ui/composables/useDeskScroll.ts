import { computed, nextTick, type Ref, watch } from "vue";

import {
  anchorTop,
  type FrameLayout,
  keptRange,
  onDesk,
  viewAnchor,
  type ViewAnchor,
  visibleRange,
} from "../../engine/frames";
import {
  pageScrollRequest,
  type PageScrollRequest,
  tabSwitch,
  zoomAnchor,
} from "../../state";
import { scrollFor } from "../scrollModel";

export interface DeskScrollOptions {
  /** what scrolls: the view's root */
  scroller: () => HTMLElement | null | undefined;
  /** the pages as the view places them on its desk */
  layout: Readonly<Ref<FrameLayout | null>>;
  /** how far the view is scrolled, as last measured */
  scrollTop: Ref<number>;
  /** how far it is scrolled across, as last measured, where it can be */
  scrollLeft?: Ref<number>;
  /** the view's height, as last measured */
  viewHeight: Readonly<Ref<number>>;
  /** measures the view again after this scrolled it */
  measure: () => void;
  /**
   * where the view goes once its first layout is there, e.g. the tab's spot
   * when the view mounts on a switch; without it, or a spot, it stays where
   * it is
   */
  startAt?: () => ViewAnchor | null;
  /**
   * whether a new layout, not a switch's, shows the pages elsewhere, so the
   * view keeps the spot at its top; without it, every new layout does
   */
  moves?: (next: FrameLayout, previous: FrameLayout) => boolean;
  /** whether a layout without the page to go back to has more coming */
  laying?: () => boolean;
  /** forgets what the view kept of the last document, on a switch */
  switched?: () => void;
}

/**
 * useDeskScroll scrolls a view of pages on a desk (the page view, a PDF
 * tab's): the pages it mounts, near the view, and those in it; back to the
 * tab's spot when another tab shows; to the spot at its top when a new
 * layout moves the pages, or to the one a zoom keeps; and to what
 * `pageScrollRequest` asks for, across too where the pages are wider than
 * the view
 */
export const useDeskScroll = (options: DeskScrollOptions) => {
  const { layout, scrollTop, viewHeight } = options;

  // the pages near the view, which changes only when other pages come near,
  // not on every scroll: they mount within a view's height of it and stay
  // until two views away
  let kept = "";
  const range = computed(() => {
    if (!layout.value) return (kept = "");
    const near = visibleRange(layout.value, scrollTop.value, viewHeight.value);
    const far = visibleRange(
      layout.value,
      scrollTop.value,
      viewHeight.value,
      2 * viewHeight.value,
    );
    return (kept = keptRange(kept, near, far));
  });

  // the pages in view, without the room around it, which come first
  const inView = computed(() =>
    layout.value
      ? visibleRange(layout.value, scrollTop.value, viewHeight.value, 0)
      : "",
  );

  // Another tab shows: what was kept of the last document goes, and the
  // view goes back to where it was on this one once its layout is there.
  // Before the new document is laid out, in the switch itself.
  const start = options.startAt?.() ?? null;
  let restoring: { anchor: ViewAnchor | null } | null = start
    ? { anchor: start }
    : null;
  watch(
    tabSwitch,
    (change) => {
      if (!change) return;
      restoring = { anchor: change.anchor };
      kept = "";
      options.switched?.();
    },
    { flush: "sync" },
  );

  /**
   * scrollTo scrolls the view to `top`: the render that follows already
   * shows the pages there, rather than those at the old scroll in the new
   * layout
   */
  const scrollTo = (top: number, left?: number) => {
    scrollTop.value = top;
    if (left !== undefined && options.scrollLeft)
      options.scrollLeft.value = left;
    void nextTick(() => {
      const element = options.scroller();
      if (!element) return;
      element.scrollTop = top;
      if (left !== undefined) element.scrollLeft = left;
      options.measure();
    });
  };

  /**
   * restore scrolls a tab shown again to where it was, once `next` has the
   * page it was on; the rest of a long document may come a chunk later
   * @returns whether the switch is done with
   */
  const restore = (next: FrameLayout, anchor: ViewAnchor | null) => {
    const top = anchor ? anchorTop(next, anchor) : 0;
    if (top === null && options.laying?.()) return false;
    // from the left edge, if a zoom shows the pages wider than the view
    scrollTo(top ?? 0, 0);
    return true;
  };

  // the view keeps the spot of the page at its top when it switches or a
  // new layout moves the pages. Before the new layout renders, so the scroll
  // is still the one the old layout was shown at.
  watch(layout, (next, previous) => {
    // the spot a zoom asked to keep where it is in the view, which is for
    // this layout only (see zoomAnchor)
    const zoomed = zoomAnchor.value;
    zoomAnchor.value = null;
    const element = options.scroller();
    if (!element || !next) return;
    if (restoring) {
      if (restore(next, restoring.anchor)) restoring = null;
      return;
    }
    // the zoom changed: the spot it was asked for stays where it is in the
    // view
    if (zoomed) {
      const rect = onDesk(next, { ...zoomed, width: 0, height: 0 });
      if (rect) {
        scrollTo(
          Math.max(0, rect.top - zoomed.viewY),
          Math.max(0, rect.left - zoomed.viewX),
        );
        return;
      }
    }
    if (!previous || (options.moves && !options.moves(next, previous))) return;
    const anchor = viewAnchor(previous, element.scrollTop);
    const top = anchor && anchorTop(next, anchor);
    if (top !== null) scrollTo(top);
  });

  /**
   * serve brings the spot a request asks for into view, as it asks: that
   * far below the top of the view, or just into it
   */
  const serve = (request: PageScrollRequest) => {
    const element = options.scroller();
    if (!element || !layout.value) return;
    const rect = onDesk(layout.value, { ...request, width: 0 });
    if (!rect) return;
    const target =
      request.at !== undefined
        ? Math.max(0, rect.top - request.at)
        : scrollFor(rect, element.scrollTop, element.clientHeight);
    // and across, when a zoom shows the pages wider than the view: the
    // desk's own width, since right after a zoom the wider desk may not be
    // rendered yet
    const across =
      layout.value.width > element.clientWidth
        ? scrollFor(
            { top: rect.left, height: rect.width },
            element.scrollLeft,
            element.clientWidth,
            { above: 20, below: 20 },
          )
        : null;
    const down = target !== null && target !== element.scrollTop;
    if (down) element.scrollTop = target;
    if (across !== null) element.scrollLeft = across;
    if (down || across !== null) options.measure();
  };

  // a request is served once, and then cleared, so an old one never moves
  // the view again, e.g. after a click far from it
  watch(
    pageScrollRequest,
    (request) => {
      if (!request) return;
      serve(request);
      pageScrollRequest.value = null;
    },
    { flush: "post" },
  );

  return { range, inView };
};
