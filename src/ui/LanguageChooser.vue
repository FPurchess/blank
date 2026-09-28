<script setup lang="ts">
import { computed } from "vue";

import {
  confirm,
  openPicker,
  pickerLanguages,
  select,
} from "../languagePicker";
import { language, languagePicker } from "../state";
import { languageLabel, optionLabel, pickerWindow } from "./statusBarModel";

// The language in the bottom bar, which opens the language picker. The
// editor keeps the focus and its plugin handles the picker's keys
// (src/editor/plugins/languagePicker.ts); this only shows the picker and
// takes clicks.
const shown = computed(() =>
  languagePicker.value.open
    ? pickerWindow(pickerLanguages(), languagePicker.value.selected)
    : [],
);

const open = () => {
  if (!languagePicker.value.open) openPicker();
};
const choose = (code: string) => {
  select(code);
  confirm();
};
</script>

<template>
  <span
    id="ui-language"
    title="Choose language"
    :class="{ open: languagePicker.open, invalid: languagePicker.invalid }"
    @mousedown.prevent
    @click="open"
  >
    <template v-if="!languagePicker.open">{{
      languageLabel(language)
    }}</template>
    <template v-else>
      <span class="more">‹</span>
      <!-- .stop: the chooser itself would open the picker again -->
      <span
        v-for="code in shown"
        :key="code"
        class="option"
        :class="{ selected: code === languagePicker.selected }"
        @click.stop="choose(code)"
        >{{ optionLabel(code) }}</span
      >
      <span class="more">›</span>
      <span v-if="languagePicker.buffer" class="buffer"
        >{{ languagePicker.buffer }}_</span
      >
    </template>
  </span>
</template>
