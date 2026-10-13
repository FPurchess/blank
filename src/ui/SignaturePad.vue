<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";

import {
  BASELINE,
  drawStrokes,
  PAD_HEIGHT,
  PAD_WIDTH,
  type Stroke,
  toPad,
} from "../signing/pad";
import { useResizeObserver } from "./composables/useResizeObserver";

// The pad a signature is drawn on with the mouse, a trackpad or a pen: the
// paper's colour, a dashed line to write on, the strokes in the page's ink.
// Its strokes are in the pad's own units (src/signing/pad.ts), so they come
// out the same whatever size the pad has on the screen.
// `errorId`: the message that says what is wrong, while something is
const props = defineProps<{ label: string; errorId?: string | undefined }>();
const strokes = defineModel<Stroke[]>({ required: true });

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
let drawing: Stroke | null = null;

const paint = () => {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!element || !context) return;
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = element.getBoundingClientRect();
  if (element.width !== Math.round(width * ratio)) {
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
  }
  context.clearRect(0, 0, element.width, element.height);
  const ink = getComputedStyle(element).color;
  drawStrokes(context, strokes.value, element.width / PAD_WIDTH, ink);
};

const pointOf = (event: PointerEvent) => {
  const box = canvas.value!.getBoundingClientRect();
  return toPad(
    event.clientX - box.left,
    event.clientY - box.top,
    event.pointerType === "mouse" ? 0 : event.pressure,
    box.width,
    box.height,
  );
};

const down = (event: PointerEvent) => {
  if (event.button !== 0) return;
  canvas.value!.setPointerCapture(event.pointerId);
  drawing = [pointOf(event)];
  strokes.value = [...strokes.value, drawing];
};

const move = (event: PointerEvent) => {
  if (!drawing) return;
  drawing.push(pointOf(event));
  paint();
};

const up = () => {
  if (!drawing) return;
  drawing = null;
  // a new list, so whoever follows the strokes sees the last one done
  strokes.value = [...strokes.value];
};

watch(strokes, paint);
useResizeObserver(() => [canvas.value], paint);
onMounted(paint);
</script>

<template>
  <div class="signature-pad" :style="{ '--baseline': `${BASELINE * 100}%` }">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="props.label"
      :aria-describedby="
        ['signature-pad-state', props.errorId].filter(Boolean).join(' ')
      "
      :aria-invalid="props.errorId ? true : undefined"
      :width="PAD_WIDTH"
      :height="PAD_HEIGHT"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    />
    <span id="signature-pad-state" class="visually-hidden">{{
      strokes.length === 0 ? "Empty" : "Drawn"
    }}</span>
    <span class="signature-pad-line" aria-hidden="true" />
    <span v-if="strokes.length === 0" class="signature-pad-hint">
      Draw with the mouse, trackpad or pen
    </span>
  </div>
</template>
