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
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import { listenOnWindow } from "../scope";
import {
  pageCaret,
  pageLayoutState,
  pageScrollRequest,
  pageView,
} from "../state";
import PageFrame from "./PageFrame.vue";
import PageOverlay from "./PageOverlay.vue";
import { drag, press } from "./pagePointer";
import { frameLayout, onDesk, scrollFor, visibleFrames } from "./pageViewModel";

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

const measure = () => {
  const element = scroller.value;
  if (!element) return;
  width.value = element.clientWidth || window.innerWidth;
  viewHeight.value = element.clientHeight || window.innerHeight;
  scrollTop.value = element.scrollTop;
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

onMounted(measure);
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
  const target = center
    ? Math.max(0, rect.top - element.clientHeight / 2)
    : scrollFor(rect, element.scrollTop, element.clientHeight);
  if (target !== null) {
    element.scrollTop = target;
    scrollTop.value = element.scrollTop;
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

const deskPoint = (event: MouseEvent) => {
  const element = scroller.value!;
  const box = element.getBoundingClientRect();
  return {
    x: event.clientX - box.left,
    y: event.clientY - box.top + element.scrollTop,
  };
};

let anchor: number | null = null;

const onMouseDown = (event: MouseEvent) => {
  if (event.button !== 0 || !pageEngine || !layout.value) return;
  // the hidden editor keeps the focus
  event.preventDefault();
  const { x, y } = deskPoint(event);
  anchor = press({ engine: pageEngine, editor, layout: layout.value }, x, y, {
    count: Math.min(event.detail || 1, 3),
    shift: event.shiftKey,
  });
};

listenOnWindow("mousemove", (event) => {
  if (anchor === null || !(event.buttons & 1) || !pageEngine || !layout.value)
    return;
  const { x, y } = deskPoint(event);
  drag({ engine: pageEngine, editor, layout: layout.value }, anchor, x, y);
});
listenOnWindow("mouseup", () => {
  anchor = null;
});
</script>

<template>
  <div
    id="page-view"
    ref="scroller"
    :class="pageView"
    @scroll="onScroll"
    @mousedown="onMouseDown"
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
      <PageOverlay :layout="layout" />
    </div>
  </div>
</template>
