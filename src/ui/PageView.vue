<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  onUpdated,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { alignHiddenEditor } from "../editor/hidden";
import { hasOpenModifier, linkHint } from "../editor/plugins/openLink";
import {
  dragCopies,
  dropExternal,
  dropMoved,
  moveCandidate,
  PAGE_MENU,
  PAGE_PRESS,
  type PagePointer,
  sendPagePointer,
  showDropAt,
} from "../editor/pagePointer";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import { record, timed } from "../engine/perf";
import { listenOnWindow } from "../scope";
import {
  pageCaret,
  pageLayoutState,
  pageScrollRequest,
  type PageScrollRequest,
  pageSelection,
  pageView,
  pageViewport,
} from "../state";
import PageFirstHeader from "./PageFirstHeader.vue";
import PageFrame from "./PageFrame.vue";
import PageMarks from "./PageMarks.vue";
import PageOverlay from "./PageOverlay.vue";
import PageProperties from "./PageProperties.vue";
import { drag, edgeStep, press, targetAt } from "./pagePointer";
import {
  type Frame,
  frameLayout,
  keptRange,
  onDesk,
  visibleRange,
} from "../engine/frames";
import { layerVersions } from "./pageLayers";
import {
  anchorTop,
  movesPages,
  scrollFor,
  selectedOn,
  viewAnchor,
} from "./pageViewModel";

// The page view: the pages the engine laid out, painted in "page ends" or
// "pages". The text is typed into the hidden editor, which keeps the focus;
// clicks and drags here are hit through the layout and select in it.
const editor = useEditor();
// how long the caret rests before the hidden editor follows it
const ALIGN_DELAY = 80;
const scroller = useTemplateRef<HTMLElement>("scroller");
const width = shallowRef(800);
const scrollTop = shallowRef(0);
const viewHeight = shallowRef(600);

// the view's box in the window, which only a resize changes, so scrolling
// doesn't measure it
let box = { left: 0, top: 0 };

// publishes where the pages are shown, for the geometry and what places
// itself at the text; only what changed, so nothing follows a scroll that
// doesn't need to
const measure = (resized = true) => {
  const element = scroller.value;
  if (!element) return;
  if (resized) {
    width.value = element.clientWidth || window.innerWidth;
    viewHeight.value = element.clientHeight || window.innerHeight;
    const rect = element.getBoundingClientRect();
    box = { left: rect.left, top: rect.top };
  }
  scrollTop.value = element.scrollTop;
  const next = {
    ...box,
    width: width.value,
    height: viewHeight.value,
    scrollTop: scrollTop.value,
  };
  const now = pageViewport.value;
  if (
    !now ||
    now.left !== next.left ||
    now.top !== next.top ||
    now.width !== next.width ||
    now.height !== next.height ||
    now.scrollTop !== next.scrollTop
  )
    pageViewport.value = next;
};

// a scroll is measured once per frame, before it's drawn
let scrolled: number | undefined;
const measureSoon = () => {
  scrolled ??= requestAnimationFrame(() => {
    scrolled = undefined;
    timed("scroll", () => measure(false));
  });
};

const layout = computed(() =>
  pageLayoutState.value
    ? frameLayout(pageLayoutState.value, pageView.value, width.value)
    : null,
);

// the pages near the view, which changes only when other pages come near,
// not on every scroll
// Pages mount within a view's height of it and stay until two views away.
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

// the pages in view, without the room around it, which paint first
const inView = computed(() =>
  layout.value
    ? visibleRange(layout.value, scrollTop.value, viewHeight.value, 0)
    : "",
);

// a frame as a page frame shows it, all plain values
type ShownFrame = Frame & {
  bodyVersion: number;
  bandVersion: number;
  nextBandVersion: number;
  near: boolean;
  selected: string;
};
// the frames shown before, by page, reused while their values stay the
// same, so a sync that changed one page makes no new objects for the others
let shownFrames = new Map<number, ShownFrame>();
const sameFrame = (a: ShownFrame, b: ShownFrame) =>
  (Object.keys(a) as (keyof ShownFrame)[]).every((key) => a[key] === b[key]);

const frames = computed(() => {
  const state = pageLayoutState.value;
  if (!layout.value || !state || !range.value)
    return ((shownFrames = new Map()), []);
  const [first, last] = range.value.split("-").map(Number);
  const [shownFirst, shownLast] = inView.value
    ? inView.value.split("-").map(Number)
    : [Infinity, -Infinity];
  const versions = layerVersions(state);
  const next = new Map<number, ShownFrame>();
  const list = layout.value.frames.slice(first, last + 1).map((frame) => {
    const made: ShownFrame = {
      ...frame,
      bodyVersion: versions.body[frame.page] ?? 0,
      bandVersion: versions.bands[frame.page] ?? 0,
      nextBandVersion:
        frame.page + 1 < state.pages
          ? (versions.bands[frame.page + 1] ?? 0)
          : -1,
      near: frame.page < shownFirst || frame.page > shownLast,
      // painted over the text while the editor has the focus, and dimmed
      // under it without (PageOverlay.vue)
      selected: focused.value
        ? selectedOn(pageSelection.value, frame.page)
        : "",
    };
    const before = shownFrames.get(frame.page);
    const shown = before && sameFrame(before, made) ? before : made;
    next.set(frame.page, shown);
    return shown;
  });
  shownFrames = next;
  return list;
});

// whether the editor has the focus: the caret shows then, and the selection
// is painted over the text; without it the selection dims, as the
// webview's own does. A test view has no DOM.
const dom = editor.view.dom as HTMLElement | undefined;
const focused = shallowRef(!dom || document.activeElement === dom);
const onFocus = () => (focused.value = true);
const onBlur = () => (focused.value = false);
onMounted(() => {
  dom?.addEventListener("focus", onFocus);
  dom?.addEventListener("blur", onBlur);
});
onUnmounted(() => {
  dom?.removeEventListener("focus", onFocus);
  dom?.removeEventListener("blur", onBlur);
});

// the device's pixels per CSS pixel, which the pages are painted at, e.g.
// when the window moves to another screen
const ratio = shallowRef(window.devicePixelRatio || 1);
let resolution: MediaQueryList | undefined;
const watchRatio = () => {
  resolution?.removeEventListener("change", onRatio);
  resolution = window.matchMedia?.(`(resolution: ${ratio.value}dppx)`);
  resolution?.addEventListener("change", onRatio);
};
const onRatio = () => {
  ratio.value = window.devicePixelRatio || 1;
  watchRatio();
};
onMounted(watchRatio);
onUnmounted(() => resolution?.removeEventListener("change", onRatio));

// the pages in view, whose marks show
const shownPages = computed(() => frames.value.map((frame) => frame.page));

onMounted(() => measure());
// e.g. when an open strip of a header or footer takes room of the window
let resized: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !scroller.value) return;
  resized = new ResizeObserver(() => measure());
  resized.observe(scroller.value);
});
onUnmounted(() => {
  resized?.disconnect();
  if (scrolled !== undefined) cancelAnimationFrame(scrolled);
  pageViewport.value = null;
});
listenOnWindow("resize", () => measure());

// the view keeps the spot of the page at its top when it switches, when a
// resize shows the pages at another scale, or when the room above the first
// page changes, e.g. for its header. Before the new layout renders,
// so the scroll is still the one the old layout was shown at; typing lays
// out anew on every key, but keeps the view and the scale.
watch(layout, (next, previous) => {
  const element = scroller.value;
  if (!element || !next || !previous) return;
  if (!movesPages(next, previous)) return;
  const anchor = viewAnchor(previous, element.scrollTop);
  if (!anchor) return;
  void nextTick(() => {
    const top = anchorTop(next, anchor);
    if (top === null || !scroller.value) return;
    scroller.value.scrollTop = top;
    measure(false);
  });
});

/**
 * serve brings the spot a request asks for into view, as it asks: that far
 * below the top of the view, or just into it
 */
const serve = (request: PageScrollRequest) => {
  const element = scroller.value;
  if (!element || !layout.value) return;
  const rect = onDesk(layout.value, { ...request, width: 0 });
  if (!rect) return;
  const target =
    request.at !== undefined
      ? Math.max(0, rect.top - request.at)
      : scrollFor(rect, element.scrollTop, element.clientHeight);
  if (target !== null && target !== element.scrollTop) {
    element.scrollTop = target;
    measure(false);
  }
};

// a request is served once, and then cleared, so an old one never moves the
// view again, e.g. after a click far from it
watch(
  pageScrollRequest,
  (request) => {
    if (!request) return;
    serve(request);
    pageScrollRequest.value = null;
  },
  { flush: "post" },
);

// the head of the selection, where the caret is or a range ends
const headBox = () =>
  pageCaret.value ?? pageEngine?.caret(editor.state.value.selection.head);

// the hidden editor's caret follows the painted one, for the IME's window,
// or the head of a range
const align = () => {
  const element = scroller.value;
  const caret = headBox();
  if (!element || !layout.value || !caret) return;
  const rect = onDesk(layout.value, { ...caret, width: 0 });
  if (!rect) return;
  const box = element.getBoundingClientRect();
  timed("align", () =>
    alignHiddenEditor(
      editor.view,
      box.left + rect.left,
      box.top + rect.top - element.scrollTop,
    ),
  );
};
// not on every key: moving it makes the webview lay out the hidden editor
// again, and the IME only needs it once composing starts
let alignTimer: ReturnType<typeof setTimeout> | undefined;
const alignSoon = () => {
  clearTimeout(alignTimer);
  alignTimer = setTimeout(align, ALIGN_DELAY);
};
watch([pageCaret, layout], alignSoon, { flush: "post" });
// the input method places its window at the hidden caret when composing
// starts, and moves it along as the composed text grows; a test view has
// no DOM
const COMPOSING = ["compositionstart", "compositionupdate"];
onMounted(() =>
  COMPOSING.forEach((type) => editor.view.dom?.addEventListener(type, align)),
);
onUnmounted(() => {
  clearTimeout(alignTimer);
  COMPOSING.forEach((type) =>
    editor.view.dom?.removeEventListener(type, align),
  );
});

// scrolling moves nothing but the pages: the hidden editor follows the
// caret when it moves or composing starts, not the scrolling, since moving
// it makes the webview lay out all of it again
const onScroll = () => measureSoon();

// how long the view takes to render, for the measurements
let renderStart = 0;
onBeforeUpdate(() => (renderStart = performance.now()));
onUpdated(() => record("render", performance.now() - renderStart));

const deskPoint = (x: number, y: number) => {
  const element = scroller.value!;
  const box = element.getBoundingClientRect();
  return { x: x - box.left, y: y - box.top + element.scrollTop };
};

// what the pointer targets, for the editor's plugins
const pointerAt = (event: MouseEvent): PagePointer => {
  const target = pageEngine &&
    layout.value && {
      engine: pageEngine,
      editor,
      layout: layout.value,
    };
  const { x, y } = deskPoint(event.clientX, event.clientY);
  return {
    ...(target ? targetAt(target, x, y) : { pos: null, link: null }),
    x: event.clientX,
    y: event.clientY,
    button: event.button,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
  };
};

// the headers and footers on the pages, which open their strips
const BANDS = ".page-band, .page-end .band, .page-first-header";

let anchor: number | null = null;
// the last point of a drag, in the window, for scrolling at the edges
let dragAt: { x: number; y: number } | null = null;
let edgeScroll: number | undefined;

const onMouseDown = (event: MouseEvent) => {
  if (!pageEngine || !layout.value) return;
  // the hidden editor keeps the focus
  event.preventDefault();
  // the editor's plugins see the press first, e.g. to close a picker
  if (sendPagePointer(editor.view, PAGE_PRESS, pointerAt(event))) return;
  if (event.button !== 0) return;
  // a header or footer opens on a double click, and a press on it leaves
  // the selection where it is
  if ((event.target as Element).closest?.(BANDS)) return;
  // a press in the selected text may drag it, see onPointerDown
  if (moving) return;
  const { x, y } = deskPoint(event.clientX, event.clientY);
  anchor = press({ engine: pageEngine, editor, layout: layout.value }, x, y, {
    count: Math.min(event.detail || 1, 3),
    shift: event.shiftKey,
  });
  dragAt = { x: event.clientX, y: event.clientY };
};

// dragging the selected text to another place: a press in it and a move of
// a few pixels, then where the pointer is let go; a press in it without a
// move places the caret there
let moving: { x: number; y: number; dragging: boolean } | null = null;
const DRAG_START = 4;
const onPointerDown = (event: PointerEvent) => {
  moving = null;
  if (!pageEngine || !layout.value || event.button !== 0 || event.shiftKey)
    return;
  if (!moveCandidate(editor.view.state, pointerAt(event).pos)) return;
  moving = { x: event.clientX, y: event.clientY, dragging: false };
  scroller.value?.setPointerCapture?.(event.pointerId);
};
const onPointerMove = (event: PointerEvent) => {
  if (!moving) return;
  const far = Math.hypot(event.clientX - moving.x, event.clientY - moving.y);
  if (!moving.dragging && far < DRAG_START) return;
  moving.dragging = true;
  showDropAt(editor.view, pointerAt(event).pos);
};
const onPointerUp = (event: PointerEvent) => {
  const was = moving;
  moving = null;
  if (!was || !pageEngine || !layout.value) return;
  if (was.dragging) {
    const { pos } = pointerAt(event);
    showDropAt(editor.view, null);
    if (pos !== null) dropMoved(editor.view, pos, dragCopies(event));
    return;
  }
  const { x, y } = deskPoint(was.x, was.y);
  press({ engine: pageEngine, editor, layout: layout.value }, x, y, {
    count: 1,
    shift: false,
  });
};
const cancelMove = () => {
  moving = null;
  showDropAt(editor.view, null);
};
listenOnWindow("keydown", (event) => {
  if (event.key === "Escape" && moving) cancelMove();
});
// text dropped from another app
const dropsText = (event: DragEvent) =>
  ["text/plain", "text/html"].some((type) =>
    event.dataTransfer?.types.includes(type),
  );
const onDragOver = (event: DragEvent) => {
  if (!dropsText(event)) return;
  event.preventDefault();
  showDropAt(editor.view, pointerAt(event).pos);
};
const onDrop = (event: DragEvent) => {
  showDropAt(editor.view, null);
  const { pos } = pointerAt(event);
  if (!event.dataTransfer || pos === null) return;
  if (dropExternal(editor.view, pos, event.dataTransfer))
    event.preventDefault();
};

// the link under the pointer, and whether the key that opens links is held:
// the pointer shows a hand then, and the link's url and hint as a tooltip
const hoverLink = shallowRef<string | null>(null);
const opening = shallowRef(false);
const onHover = (event: MouseEvent) => {
  opening.value = hasOpenModifier(event);
  if (anchor !== null) return;
  hoverLink.value = pointerAt(event).link;
};
const onModifier = (event: KeyboardEvent) => {
  opening.value = hasOpenModifier(event);
};
listenOnWindow("keydown", onModifier);
listenOnWindow("keyup", onModifier);

// Blank's menu, with Shift too: the webview's own has Back and Reload on the
// pages, which src/nativeMenu.ts keeps away
const onContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  sendPagePointer(editor.view, PAGE_MENU, pointerAt(event));
};

const dragTo = (x: number, y: number) => {
  if (anchor === null || !pageEngine || !layout.value) return;
  const point = deskPoint(x, y);
  drag(
    { engine: pageEngine, editor, layout: layout.value },
    anchor,
    point.x,
    point.y,
  );
};

// while a drag is beyond the top or bottom edge, the view scrolls, the
// faster the farther
const scrollAtEdges = () => {
  edgeScroll = undefined;
  const element = scroller.value;
  if (anchor === null || !dragAt || !element) return;
  const box = element.getBoundingClientRect();
  const step = edgeStep(dragAt.y, box.top, box.bottom);
  if (step === 0) return;
  element.scrollTop += step;
  measure(false);
  dragTo(dragAt.x, dragAt.y);
  edgeScroll = requestAnimationFrame(scrollAtEdges);
};

listenOnWindow("mousemove", (event) => {
  if (anchor === null || !(event.buttons & 1)) return;
  dragAt = { x: event.clientX, y: event.clientY };
  dragTo(event.clientX, event.clientY);
  if (edgeScroll === undefined)
    edgeScroll = requestAnimationFrame(scrollAtEdges);
});
listenOnWindow("mouseup", () => {
  anchor = null;
  dragAt = null;
  if (edgeScroll !== undefined) cancelAnimationFrame(edgeScroll);
  edgeScroll = undefined;
});
onUnmounted(() => {
  if (edgeScroll !== undefined) cancelAnimationFrame(edgeScroll);
});
</script>

<template>
  <!-- screen readers read the editor behind the pages, which holds the same
  text in the order of the document -->
  <div
    id="page-view"
    ref="scroller"
    aria-hidden="true"
    :class="[pageView, { 'follow-links': hoverLink && opening }]"
    :title="hoverLink ? linkHint(hoverLink) : undefined"
    @scroll="onScroll"
    @mousedown="onMouseDown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="cancelMove"
    @dragover="onDragOver"
    @dragleave="showDropAt(editor.view, null)"
    @drop="onDrop"
    @mousemove="onHover"
    @mouseleave="hoverLink = null"
    @contextmenu="onContextMenu"
  >
    <div
      v-if="layout"
      class="page-desk"
      :style="{ height: `${layout.height}px` }"
    >
      <!-- the sheets, then the selection, then the text painted on them,
      which is transparent but for the text -->
      <template v-if="layout.mode === 'pages'">
        <div
          v-for="frame in frames"
          :key="frame.page"
          class="page-sheet"
          :style="{
            top: `${frame.top}px`,
            left: `${frame.left}px`,
            width: `${frame.width}px`,
            height: `${frame.height}px`,
          }"
        />
      </template>
      <PageOverlay
        :layout="layout"
        layer="under"
        :ratio="ratio"
        :focused="focused"
      />
      <PageFrame
        v-for="frame in frames"
        :key="frame.page"
        :page="frame.page"
        :body-version="frame.bodyVersion"
        :band-version="frame.bandVersion"
        :next-band-version="frame.nextBandVersion"
        :selected="frame.selected"
        :top="frame.top"
        :left="frame.left"
        :width="frame.width"
        :height="frame.height"
        :x="frame.x"
        :y="frame.y"
        :scale="layout.scale"
        :sheet="layout.mode === 'pages'"
        :near="frame.near"
        :ratio="ratio"
      />
      <PageMarks :layout="layout" :pages="shownPages" />
      <PageOverlay
        :layout="layout"
        layer="over"
        :ratio="ratio"
        :focused="focused"
      />
      <PageFirstHeader :layout="layout" />
      <PageProperties :layout="layout" />
    </div>
  </div>
</template>
