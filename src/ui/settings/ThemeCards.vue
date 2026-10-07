<script setup lang="ts">
import { useTemplateRef } from "vue";

import {
  chooseTheme,
  theme,
  themeLabel,
  themes,
  type ThemeName,
} from "../../state";
import { useRovingFocus } from "../composables/useRovingFocus";

// The themes as cards, each drawn in its own colors: a preview carries
// data-theme, so the tokens inside it are that theme's. A radio group, whose
// arrows choose the next.
const root = useTemplateRef<HTMLElement>("root");

const { current, onKeydown, follow } = useRovingFocus(
  () => root.value,
  "[role=radio]",
  themes.indexOf(theme.value),
  (index) => chooseTheme(themes[index]),
  "both",
);

const press = (name: ThemeName, event: MouseEvent) => {
  follow(event.currentTarget);
  chooseTheme(name);
};
</script>

<template>
  <div
    ref="root"
    class="theme-cards"
    role="radiogroup"
    aria-label="Theme"
    @keydown="onKeydown"
  >
    <button
      v-for="(name, index) in themes"
      :key="name"
      type="button"
      role="radio"
      class="theme-card"
      :data-value="name"
      :aria-checked="theme === name"
      :tabindex="index === current ? 0 : -1"
      @click="press(name, $event)"
    >
      <span class="preview" :data-theme="name" aria-hidden="true"><i /></span>
      {{ themeLabel(name) }}
    </button>
  </div>
</template>
