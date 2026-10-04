<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { useEditor } from "../editor/handle";
import { place } from "../popup";
import { activeTab, tabLabel } from "../state";
import { wordCountOf, wordCountRows } from "../wordCount";
import { useDismiss } from "./composables/useDismiss";

// The details of the word count, above it in the bottom bar: the document's
// words, characters, pages, how long it takes to read, and the words
// selected. It's only there while it shows, so nothing is counted while
// typing otherwise. It never takes the focus: a key closes it and goes on to
// the editor.
const props = defineProps<{
  // the word count, which it opens above
  counter: () => HTMLElement | undefined;
}>();
const emit = defineEmits<{ close: [] }>();

const editor = useEditor();
const name = computed(() =>
  activeTab.value ? tabLabel(activeTab.value) : "Untitled",
);
const rows = computed(() => wordCountRows(wordCountOf(editor.state.value)));

const root = useTemplateRef<HTMLElement>("root");
const placeCard = () => {
  const box = props.counter()?.getBoundingClientRect();
  if (box && root.value) place(root.value, box);
};
onMounted(placeCard);
onUpdated(placeCard);

// a key closes it, and a press outside it and the count, whose own click
// toggles it
useDismiss(
  () => [root.value, props.counter()],
  () => emit("close"),
  {
    anyKey: true,
  },
);
</script>

<template>
  <div
    id="word-count-card"
    ref="root"
    class="word-count-card"
    role="group"
    aria-label="Word count"
    @mousedown.prevent
  >
    <div class="name">{{ name }}</div>
    <dl>
      <div v-for="[label, value] in rows" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>
  </div>
</template>
