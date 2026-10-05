<script setup lang="ts">
import { computed, shallowRef } from "vue";

import IconButton from "../components/IconButton.vue";
import TextField from "../components/TextField.vue";
import { filterEntries, FILTER_FROM } from "./settingsModel";

// The list of an inner page of the settings, e.g. your dictionary's words:
// sorted, each with Remove, and a filter once there are more than a few. The
// default slot shows an entry, the list's `entry` by default.
export interface Entry {
  key: string;
  // what it becomes, for a replacement
  label?: string;
}
const props = defineProps<{
  id: string;
  entries: Entry[];
  // what the list says while it's empty
  empty: string;
  // names the filter for screen readers, e.g. "Filter your words"
  filterLabel: string;
  // names Remove of an entry for screen readers, e.g. "Remove mp3"
  removeLabel: (entry: Entry) => string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ remove: [key: string] }>();

const query = shallowRef("");
const shown = computed(() => filterEntries(props.entries, query.value));
</script>

<template>
  <div class="entry-list">
    <div v-if="entries.length > FILTER_FROM" class="compact filter">
      <TextField
        :id="`${id}-filter`"
        v-model="query"
        :label="filterLabel"
        placeholder="Filter"
      />
    </div>
    <ul :id="id" :aria-label="filterLabel.replace(/^Filter /, '')">
      <li v-for="entry in shown" :key="entry.key" class="entry">
        <span class="entry-text"
          ><slot :entry="entry">{{ entry.key }}</slot></span
        >
        <IconButton
          icon="x"
          :label="removeLabel(entry)"
          :disabled="disabled"
          @click="!disabled && emit('remove', entry.key)"
        />
      </li>
    </ul>
    <p v-if="entries.length === 0" class="empty">{{ empty }}</p>
    <p v-else-if="shown.length === 0" class="empty">Nothing matches.</p>
  </div>
</template>
