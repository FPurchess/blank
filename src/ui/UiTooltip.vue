<script setup lang="ts">
import { onMounted, onUpdated, shallowRef, useTemplateRef } from "vue";

import { placeTip } from "../popup";
import { TIP_ID, TIP_KEY_ID, type Tip, watchTips } from "./tooltipModel";

// The tooltip of the control the pointer rests on: its name and shortcut
// (tooltipModel.ts). It never takes the focus or the pointer, and describes
// the control to screen readers only while it shows.
const tip = shallowRef<Tip | null>(null);
const root = useTemplateRef<HTMLElement>("root");

watchTips(
  (next) => (tip.value = next),
  () => (tip.value = null),
);

// placed after every render, when its text has its width
const place = () => {
  if (tip.value && root.value) {
    placeTip(root.value, tip.value.target.getBoundingClientRect(), tip.value.x);
  }
};
onMounted(place);
onUpdated(place);
</script>

<template>
  <div v-if="tip" :id="TIP_ID" ref="root" class="tooltip" role="tooltip">
    <span>{{ tip.name }}</span>
    <kbd v-if="tip.key" :id="TIP_KEY_ID">{{ tip.key }}</kbd>
  </div>
</template>
