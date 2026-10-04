<script setup lang="ts">
import { computed } from "vue";

import { NAMES } from "../bandStrip";
import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import type { Band, DocumentFields } from "../layout/bands";
import { SLOTS, type Slots } from "../layout/settings";
import { editBandShortcut } from "./bandStripsModel";
import SlotText from "./SlotText.vue";

// A header or footer at rest, pinned to the top or bottom of the window: a
// faint line of what it says, or the hints to add it, which show while the
// mouse is near the edge. A click opens its strip.
const props = defineProps<{
  band: Band;
  // the band of every page, or else of the first or even pages
  slots: Slots | undefined;
  fields: DocumentFields;
  // while its strip is open, or the pages show the band themselves
  hidden: boolean;
}>();

const editor = useEditor();
const title = computed(
  () => `Edit the ${props.band} (${editBandShortcut(props.band)})`,
);
// the strip takes the focus itself
const open = (insert?: string) =>
  editor.run(editBand(props.band, insert), { focus: false });
</script>

<template>
  <div
    :id="`band-${band}`"
    class="band-edge"
    :class="[band, { empty: !slots }]"
    :hidden="hidden"
  >
    <div class="band-inner">
      <div
        v-if="slots"
        class="band-line"
        role="button"
        :title="title"
        @mousedown.prevent
        @click="open()"
      >
        <span v-for="slot in SLOTS" :key="slot" class="slot-text" :class="slot"
          ><SlotText :text="slots[slot]" :fields="fields"
        /></span>
      </div>
      <!-- the hints are for the mouse: the keyboard opens the strips with
      their shortcuts -->
      <div v-else class="band-hint">
        <button type="button" tabindex="-1" @mousedown.prevent @click="open()">
          + {{ NAMES[band] }}</button
        ><button
          v-if="band === 'footer'"
          type="button"
          tabindex="-1"
          @mousedown.prevent
          @click="open('{page}')"
        >
          # Page numbers
        </button>
      </div>
    </div>
  </div>
</template>
