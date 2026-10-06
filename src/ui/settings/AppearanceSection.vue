<script setup lang="ts">
import { computed } from "vue";

import { config } from "../../config";
import OptionGroup from "../components/OptionGroup.vue";
import { hideAfterMessage, hideAfterOptions, save } from "./settingsModel";
import ThemeCards from "./ThemeCards.vue";

// Appearance: the theme, and when focus mode hides the controls.
const hideAfter = computed({
  get: () => config.value.focusMode.hideAfter,
  set: (seconds: number) =>
    void save(
      [{ path: ["focusMode", "hideAfter"], value: seconds }],
      hideAfterMessage(seconds),
    ),
});
const options = computed(() => hideAfterOptions(hideAfter.value));
</script>

<template>
  <h3 class="settings-heading">Theme</h3>
  <ThemeCards />
  <h3 class="settings-heading">Interface</h3>
  <OptionGroup
    id="settings-hide-after"
    v-model="hideAfter"
    name="hide-after"
    label="In focus mode, hide the controls"
    description="Typing always hides them; moving the mouse brings them back."
    aria-describedby="settings-hide-after-description"
    :options="options"
  />
</template>
