<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { alignHiddenEditor } from "../editor/hidden";
import { hasOpenModifier, linkHint } from "../editor/plugins/openLink";
import {
  PAGE_MENU,
  PAGE_PRESS,
  type PagePointer,
  sendPagePointer,
} from "../editor/pagePointer";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import { listenOnWindow } from "../scope";
import {
  pageCaret,
  pageLayoutState,
  pageScrollRequest,
  pageView,
  pageViewport,
} from "../state";
import PageFrame from "./PageFrame.vue";
import PageMarks from "./PageMarks.vue";
import PageOverlay from "./PageOverlay.vue";
import PageProperties from "./PageProperties.vue";
import { drag, edgeStep, press, targetAt } from "./pagePointer";
import { frameLayout, onDesk, visibleFrames } from "../engine/frames";
import { scrollFor } from "./pageViewModel";

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

// publishes where the pages are shown, for the geometry and what places
// itself at the text
const measure = () => {
  const element = scroller.value;
  if (!element) return;
  width.value = element.clientWidth || window.innerWidth;
  viewHeight.value = element.clientHeight || window.innerHeight;
  scrollTop.value = element.scrollTop;
  const box = element.getBoundingClientRect();
  pageViewport.value = {
    left: box.left,
    top: box.top,
    width: width.value,
    height: viewHeight.value,
    scrollTop: scrollTop.value,
  };
};

const layout = computed(() =>
  pageLayoutState.value
    ? frameLayout(pageLayoutState.value, pageView.value, width.value)
    : null,
);

const frames = computed(() => {
  const state = pageLayoutState.value;
  if (!layout.value || !state) return [];
  return visibleFrames(layout.value, scrollTop.value, viewHeight.value).map(
    (frame) => ({
      ...frame,
      version: state.versions[frame.page] ?? 0,
      nextVersion:
        frame.page + 1 < state.pages
          ? (state.versions[frame.page + 1] ?? 0)
          : -1,
    }),
  );
});

// the pages in view, whose marks show
const shownPages = computed(() => frames.value.map((frame) => frame.page));

onMounted(measure);
// e.g. when an open strip of a header or footer takes room of the window
let resized: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !scroller.value) return;
  resized = new ResizeObserver(() => measure());
  resized.observe(scroller.value);
});
onUnmounted(() => {
  resized?.disconnect();
  pageViewport.value = null;
});
listenOnWindow("resize", measure);

// the view keeps its place on the page when it switches or resizes
watch(pageView, async () => {
  await nextTick();
  scrollToCaret(true);
});

const scrollToCaret = (center = false) => {
  const element = scroller.value;
  const request = pageScrollRequest.value ?? pageCaret.value;
  if (!element || !layout.value || !request) return;
  const rect = onDesk(layout.value, { ...request, width: 0 });
  if (!rect) return;
  const at = pageScrollRequest.value?.at;
  const target = center
    ? Math.max(0, rect.top - element.clientHeight / 2)
    : at !== undefined
      ? Math.max(0, rect.top - at)
      : scrollFor(rect, element.scrollTop, element.clientHeight);
  if (target !== null && target !== element.scrollTop) {
    element.scrollTop = target;
    measure();
  }
};

watch(pageScrollRequest, () => scrollToCaret(), { flush: "post" });

// the hidden editor's caret follows the painted one, for the IME's window
const align = () => {
  const element = scroller.value;
  const caret = pageCaret.value;
  if (!element || !layout.value || !caret) return;
  const rect = onDesk(layout.value, { ...caret, width: 0 });
  if (!rect) return;
  const box = element.getBoundingClientRect();
  alignHiddenEditor(
    editor.view,
    box.left + rect.left,
    box.top + rect.top - element.scrollTop,
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
// a test view has no DOM
onMounted(() => editor.view.dom?.addEventListener("compositionstart", align));
onUnmounted(() => {
  clearTimeout(alignTimer);
  editor.view.dom?.removeEventListener("compositionstart", align);
});

const onScroll = () => {
  measure();
  alignSoon();
};

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
  const { x, y } = deskPoint(event.clientX, event.clientY);
  anchor = press({ engine: pageEngine, editor, layout: layout.value }, x, y, {
    count: Math.min(event.detail || 1, 3),
    shift: event.shiftKey,
  });
  dragAt = { x: event.clientX, y: event.clientY };
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

const onContextMenu = (event: MouseEvent) => {
  // Shift keeps the webview's menu, e.g. for system services
  if (event.shiftKey) return;
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
  measure();
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
  <div
    id="page-view"
    ref="scroller"
    :class="[pageView, { 'follow-links': hoverLink && opening }]"
    :title="hoverLink ? linkHint(hoverLink) : undefined"
    @scroll="onScroll"
    @mousedown="onMouseDown"
    @mousemove="onHover"
    @mouseleave="hoverLink = null"
    @contextmenu="onContextMenu"
  >
    <div
      v-if="layout"
      class="page-desk"
      :style="{ height: `${layout.height}px` }"
    >
      <PageFrame
        v-for="frame in frames"
        :key="frame.page"
        :page="frame.page"
        :version="frame.version"
        :next-version="frame.nextVersion"
        :top="frame.top"
        :left="frame.left"
        :width="frame.width"
        :height="frame.height"
        :x="frame.x"
        :y="frame.y"
        :scale="layout.scale"
        :sheet="layout.mode === 'pages'"
      />
      <PageMarks :layout="layout" :pages="shownPages" />
      <PageOverlay :layout="layout" />
      <PageProperties :layout="layout" />
    </div>
  </div>
</template>
