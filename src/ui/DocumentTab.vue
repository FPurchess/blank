<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { type Tab, tabLabel, tabTooltip } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { tipAttrs } from "./tooltipModel";

// One tab of the tab row: the document's name, and × to close it, which an
// unsaved tab shows as a dot until the pointer is on it. The × is for the
// pointer only; the keys close a tab with Delete (see TabRow.vue).
const props = defineProps<{
  tab: Tab;
  selected: boolean;
  // whether it's the tab in the tab order (a roving tabindex)
  focusable: boolean;
}>();

const tip = computed(() => tipAttrs({ name: tabTooltip(props.tab) }));
const closeTip = tipAttrs({
  name: "Close",
  command: CommandIdentifier.TAB_CLOSE,
});
</script>

<template>
  <div
    :id="`tab-${tab.id}`"
    class="tab"
    :class="{ unsaved: tab.unsaved }"
    role="tab"
    :data-tab-id="tab.id"
    :aria-selected="selected"
    :tabindex="focusable ? 0 : -1"
    v-bind="tip"
  >
    <span class="tab-label">{{ tabLabel(tab) }}</span>
    <span class="tab-close" aria-hidden="true" v-bind="closeTip">
      <IconGlyph name="x" />
    </span>
  </div>
</template>
