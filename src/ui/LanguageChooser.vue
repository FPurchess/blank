<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import {
  confirm,
  openPicker,
  pickerLanguages,
  select,
} from "../languagePicker";
import { language, languagePicker } from "../state";
import StatusItem from "./StatusItem.vue";
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
  <div
    id="ui-language"
    :class="{ open: languagePicker.open, invalid: languagePicker.invalid }"
  >
    <StatusItem
      v-if="!languagePicker.open"
      icon="globe"
      :command="CommandIdentifier.LANGUAGE_CHOOSE"
      @click="open"
      >{{ languageLabel(language) }}</StatusItem
    >
    <!-- the picker: the editor's keys move through it, and a click on a
    language chooses it -->
    <span
      v-else
      class="picker"
      role="listbox"
      aria-label="Language"
      @mousedown.prevent
    >
      <span class="more">‹</span>
      <span
        v-for="code in shown"
        :key="code"
        class="option"
        role="option"
        :aria-selected="code === languagePicker.selected"
        :class="{ selected: code === languagePicker.selected }"
        @click="choose(code)"
        >{{ optionLabel(code) }}</span
      >
      <span class="more">›</span>
      <span v-if="languagePicker.buffer" class="buffer"
        >{{ languagePicker.buffer }}_</span
      >
    </span>
  </div>
</template>
