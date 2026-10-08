<script setup lang="ts">
import { onMounted, onUpdated, useTemplateRef } from "vue";

import { pdfBitmaps } from "./pageBitmaps";

// One page of a PDF (PdfView.vue): a canvas the helper's bitmap of the page
// is drawn into, stretched while one at the scale shown is still being
// drawn, or what says the page couldn't be drawn. Its props are plain
// values, so it draws again only when one changes.
const props = defineProps<{
  top: number;
  left: number;
  width: number;
  height: number;
  // device pixels per CSS pixel
  ratio: number;
  // the key of the bitmap to show (pdfBitmaps), "" while there is none
  bitmap: string;
  failed: boolean;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

const draw = () => {
  const element = canvas.value;
  const bitmap = props.bitmap ? pdfBitmaps.get(props.bitmap) : undefined;
  if (!element) return;
  const width = Math.round(props.width * props.ratio);
  const height = Math.round(props.height * props.ratio);
  if (element.width !== width) element.width = width;
  if (element.height !== height) element.height = height;
  const context = element.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (bitmap) context.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
};
onMounted(draw);
onUpdated(draw);
</script>

<template>
  <div
    class="pdf-page"
    :style="{
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
    }"
  >
    <canvas ref="canvas" class="page-canvas" />
    <p v-if="failed" class="pdf-page-failed">Blank couldn't draw this page</p>
  </div>
</template>
