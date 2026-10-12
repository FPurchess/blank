<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { imagesLoaded } from "../engine/images";
import type { Frame, PageSize } from "../engine/frames";
import type { Rect as PageRect } from "../pdf/fields";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { removeStamp, updateStamp } from "../pdf/stampActions";
import { paintStamp } from "../pdf/stampEngine";
import {
  type Corner,
  nudge,
  resizeBy,
  scaledSpec,
  type Stamp,
  stampLabel,
} from "../pdf/stampModel";
import { savedMarks, selectedStamp } from "../state";
import { styleOf } from "./rect";
import { dragTo, type Drag, sameRect, startDrag } from "./stampDrag";
import { stampBox, stampKeyAction } from "./stampOverlayModel";

// A stamp on a PDF's page (PdfView.vue): its canvas, painted by its stamp
// engine at the page's scale, a group screen readers name ("Signature on
// page 2, selected"), and while it's selected the accent ring and the four
// corners that resize it. Arrows move it, Alt and the arrows resize it,
// Delete removes it and Esc deselects it; the mouse moves it and resizes it
// from its corners (stampDrag.ts). A repeated stamp's `ghost` on another
// page only shows, faded, to no one but the eye.
const props = defineProps<{
  stamp: Stamp;
  // the page it shows on, and its size in points
  frame: Frame;
  page: PageSize;
  // CSS pixels per point
  scale: number;
  // where a repeated stamp shows on another page than its own
  ghost?: PageRect;
}>();

const root = useTemplateRef<HTMLElement>("root");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

const CORNERS: Corner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

// the stamp as a drag shows it until it's let go
const preview = shallowRef<Stamp | null>(null);
let drag: Drag | null = null;

const shown = computed(() => preview.value ?? props.stamp);
const rect = computed(() => props.ghost ?? shown.value.rect);
const box = computed(() => stampBox(rect.value, props.frame, props.scale));
const selected = computed(
  () => !props.ghost && selectedStamp.value === props.stamp.id,
);
const label = computed(() => stampLabel(props.stamp, selected.value));

// painted again when it looks different or shows at another size, and once
// the user's signature, which it shows, has loaded
// (each stamp engine paints one after the other, so the last one asked
// shows)
const paint = async () => {
  const element = canvas.value;
  if (!element) return;
  const [, , width, height] = rect.value;
  const spec = scaledSpec({ ...shown.value, rect: rect.value });
  try {
    await paintStamp(spec, element, { width, height }, props.scale);
  } catch {
    // without the layout it stays empty; the toolbar says why
  }
};
watch(
  () => [
    JSON.stringify(scaledSpec({ ...shown.value, rect: rect.value })),
    rect.value[2],
    rect.value[3],
    props.scale,
    imagesLoaded.value,
    savedMarks.value,
  ],
  paint,
  { flush: "post", immediate: true },
);

const pages = () => document.getElementById(PDF_VIEW_ID);

const select = () => {
  if (!props.ghost) selectedStamp.value = props.stamp.id;
};

const onKeydown = (event: KeyboardEvent) => {
  if (drag && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    drag = null;
    preview.value = null;
    return;
  }
  const action = stampKeyAction(event);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  const { stamp, page } = props;
  switch (action.kind) {
    case "nudge":
      updateStamp(nudge(stamp, action.dx, action.dy, page), Date.now());
      return;
    case "resize":
      updateStamp(resizeBy(stamp, action.by, page));
      return;
    case "remove":
      removeStamp(stamp.id);
      return;
    case "deselect":
      selectedStamp.value = null;
      pages()?.focus();
  }
};

const onPointerdown = (event: PointerEvent, grip: Drag["grip"] = "move") => {
  if (event.button !== 0 || props.ghost) return;
  event.preventDefault();
  event.stopPropagation();
  select();
  root.value?.focus({ preventScroll: true });
  drag = startDrag(props.stamp, grip, event.clientX, event.clientY);
  (event.target as Element).setPointerCapture?.(event.pointerId);
};
const onPointermove = (event: PointerEvent) => {
  if (!drag) return;
  const moved = dragTo(
    drag,
    event.clientX,
    event.clientY,
    props.scale,
    props.page,
  );
  drag = moved.drag;
  if (moved.stamp) preview.value = moved.stamp;
};
const onPointerup = () => {
  const done = preview.value;
  drag = null;
  preview.value = null;
  if (done && !sameRect(done.rect, props.stamp.rect)) updateStamp(done);
};

// a stamp undone or removed while it holds the focus gives it to the pages
onBeforeUnmount(() => {
  if (root.value?.contains(document.activeElement))
    void nextTick(() => pages()?.focus());
});
</script>

<template>
  <div
    v-if="ghost"
    class="pdf-stamp ghost"
    aria-hidden="true"
    :style="styleOf(box)"
  >
    <canvas ref="canvas" />
  </div>
  <div
    v-else
    :id="`stamp-${stamp.id}`"
    ref="root"
    class="pdf-stamp"
    :class="{ selected, dragging: preview !== null }"
    role="group"
    tabindex="0"
    :aria-label="label"
    :style="styleOf(box)"
    @focus="select"
    @keydown="onKeydown"
    @pointerdown="onPointerdown($event)"
    @pointermove="onPointermove"
    @pointerup="onPointerup"
    @pointercancel="onPointerup"
  >
    <canvas ref="canvas" aria-hidden="true" />
    <template v-if="selected">
      <span
        v-for="corner in CORNERS"
        :key="corner"
        class="stamp-handle"
        :data-corner="corner"
        aria-hidden="true"
        @pointerdown="onPointerdown($event, corner)"
        @pointermove="onPointermove"
        @pointerup="onPointerup"
        @pointercancel="onPointerup"
      />
    </template>
  </div>
</template>
