<script setup lang="ts">
import { computed } from "vue";

import { announcement, textContent } from "../state";
import LanguageChooser from "./LanguageChooser.vue";
import PageButton from "./PageButton.vue";
import SpellcheckStatus from "./SpellcheckStatus.vue";
import { countOf } from "./statusBarModel";

// The bar at the bottom of the window: the counter and what just happened on
// the left, the page, spell check and language on the right. Each item on the
// right is a component of its own, so typing only updates the counter.
const count = computed(() => countOf(textContent.value));
</script>

<template>
  <div id="ui-bottom">
    <span id="ui-stats">{{ count }}</span>
    <!-- what just happened, e.g. "2 rows added": shown for a moment and read
    out by screen readers, so it's always there, empty in between. It sits
    next to the counter, so it doesn't push the items on the right. -->
    <span id="ui-announcement" role="status">{{
      announcement?.text ?? ""
    }}</span>
    <PageButton />
    <SpellcheckStatus />
    <LanguageChooser />
  </div>
</template>
