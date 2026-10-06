<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from "vue";

import IconButton from "../components/IconButton.vue";
import TextField from "../components/TextField.vue";
import { filterEntries, FILTER_FROM } from "./settingsModel";

// The list of an inner page of the settings, e.g. your dictionary's words:
// sorted, each with Remove, and a filter once there are more than a few. The
// default slot shows an entry, its key by default. After a remove, the focus
// goes to the Remove next to it, or back to the page's first field.
interface Entry {
  key: string;
  // what it becomes, for a replacement
  label?: string;
}
const props = defineProps<{
  id: string;
  // names the list for screen readers, e.g. "your words"
  label: string;
  entries: Entry[];
  // what the list says while it's empty
  empty: string;
  // names Remove of an entry for screen readers, e.g. "Remove mp3"
  removeLabel: (entry: Entry) => string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ remove: [key: string] }>();

const root = useTemplateRef<HTMLElement>("root");
const query = shallowRef("");
const shown = computed(() => filterEntries(props.entries, query.value));

// where the focus goes once the removed entry is gone
let removedAt: number | null = null;
const remove = (key: string, index: number) => {
  if (props.disabled) return;
  removedAt = index;
  emit("remove", key);
};
watch(
  shown,
  (entries) => {
    if (removedAt === null) return;
    const buttons = root.value!.querySelectorAll<HTMLElement>(".entry button");
    const next =
      buttons[Math.min(removedAt, entries.length - 1)] ??
      root.value!.closest(".inner-page")?.querySelector<HTMLElement>("input");
    removedAt = null;
    next?.focus();
  },
  { flush: "post" },
);
</script>

<template>
  <div ref="root" class="entry-list">
    <div v-if="entries.length > FILTER_FROM" class="compact filter">
      <TextField
        :id="`${id}-filter`"
        v-model="query"
        :label="`Filter ${label}`"
        placeholder="Filter"
      />
    </div>
    <ul :id="id" :aria-label="label">
      <li v-for="(entry, index) in shown" :key="entry.key" class="entry">
        <span class="entry-text"
          ><slot :entry="entry">{{ entry.key }}</slot></span
        >
        <IconButton
          icon="x"
          :label="removeLabel(entry)"
          :disabled="disabled"
          @click="remove(entry.key, index)"
        />
      </li>
    </ul>
    <p v-if="entries.length === 0" class="empty">{{ empty }}</p>
    <p v-else-if="shown.length === 0" class="empty">Nothing matches.</p>
  </div>
</template>
