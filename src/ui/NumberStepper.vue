<script setup lang="ts">
import { shallowRef, watch } from "vue";

import IconButton from "./components/IconButton.vue";

// A whole number from `min` to `max`, typed or stepped: −, the field, +.
// ↑↓ in the field step it too. What is typed counts as soon as it is a
// number, kept within the bounds; leaving the field shows what counts.
const props = defineProps<{
  id: string;
  // the id of the label that names the field
  labelledby: string;
  min: number;
  max: number;
  // the names of the buttons, e.g. "Fewer copies"
  decreaseLabel: string;
  increaseLabel: string;
}>();
const value = defineModel<number>({ required: true });

const typed = shallowRef(String(value.value));
watch(value, (next) => {
  if (Number.parseInt(typed.value, 10) !== next) typed.value = String(next);
});

const clamp = (number: number) =>
  Math.min(Math.max(number, props.min), props.max);

const onInput = () => {
  const number = Number.parseInt(typed.value, 10);
  if (!Number.isNaN(number)) value.value = clamp(number);
};

// the buttons are only aria-disabled, so they check the bounds themselves.
// It steps from what the field shows, which follows at once, while the model
// follows on the next render.
const step = (by: 1 | -1) => {
  const shown = Number.parseInt(typed.value, 10);
  const next = clamp((Number.isNaN(shown) ? value.value : shown) + by);
  value.value = next;
  typed.value = String(next);
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  step(event.key === "ArrowUp" ? 1 : -1);
};
</script>

<template>
  <div class="stepper">
    <IconButton
      icon="minus"
      :label="decreaseLabel"
      :disabled="value <= min"
      @click="step(-1)"
    />
    <input
      :id="id"
      v-model="typed"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :aria-labelledby="labelledby"
      @input="onInput"
      @keydown="onKeydown"
      @blur="typed = String(value)"
    />
    <IconButton
      icon="plus"
      :label="increaseLabel"
      :disabled="value >= max"
      @click="step(1)"
    />
  </div>
</template>
