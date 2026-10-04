<script setup lang="ts">
import { computed, onScopeDispose, useTemplateRef } from "vue";

import { CommandIdentifier } from "../config";
import { textContent, wordCountCard } from "../state";
import { countWords, formatCount } from "../wordCount";
import { hoverIntent } from "./hoverIntent";
import StatusItem from "./StatusItem.vue";
import WordCountCard from "./WordCountCard.vue";

// The number of words in the bottom bar. Its card with the details opens once
// the pointer rests on it, on a click, or with the Word count command, and
// stays while the pointer is on the count or the card; a second click
// closes it.
const words = computed(() => formatCount(countWords(textContent.value)));

const item = useTemplateRef<InstanceType<typeof StatusItem>>("item");
const counter = () => item.value?.$el as HTMLElement | undefined;

const close = () => (wordCountCard.value = false);
const hover = hoverIntent({
  openAfter: 300,
  closeAfter: 500,
  open: () => (wordCountCard.value = true),
  close,
});
onScopeDispose(hover.cancel);
// a click opens the card, or closes it again
const toggle = () => {
  if (!wordCountCard.value) return hover.openNow();
  hover.cancel();
  close();
};
</script>

<template>
  <StatusItem
    id="ui-stats"
    ref="item"
    :command="CommandIdentifier.TOOLS_STATS"
    aria-controls="word-count-card"
    :aria-expanded="wordCountCard"
    @pointerenter="hover.enter"
    @pointerleave="hover.leave"
    @click="toggle"
    >{{ words }} words</StatusItem
  >
  <!-- out of the bar, whose stacking would keep the card below the strips
  and toolbars over the pages -->
  <Teleport to="#ui-app">
    <WordCountCard
      v-if="wordCountCard"
      :counter="counter"
      @pointerenter="hover.enter"
      @pointerleave="hover.leave"
      @close="
        hover.cancel();
        close();
      "
    />
  </Teleport>
</template>
