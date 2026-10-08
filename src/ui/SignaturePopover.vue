<script setup lang="ts">
import { shallowRef, watch } from "vue";

import {
  closeDialog,
  signaturePopover,
  type SignaturePopoverRequest,
} from "../state";
import BlockPopover from "./components/BlockPopover.vue";
import OptionGroup from "./components/OptionGroup.vue";
import {
  DATE_OPTIONS,
  dateChoiceOf,
  settingsOf,
  today,
  WIDTH_OPTIONS,
  widthChoiceOf,
} from "./signaturePopoverModel";

// The settings of a signature block (Enter or the toolbar's settings
// button, see src/editor/commands/contentBlocks.ts): who signs and as what,
// where and when, and how wide it is. Each change applies at once, as one
// undo step.
const props = defineProps<{ request: SignaturePopoverRequest }>();

const start = props.request.settings;
const role = shallowRef(start.role);
const name = shallowRef(start.name);
const where = shallowRef(start.place);
const date = shallowRef(dateChoiceOf(start.date));
const fixed = shallowRef(date.value === "fixed" ? start.date : today());
const width = shallowRef(widthChoiceOf(start.width));

const apply = () =>
  props.request.apply(
    settingsOf({
      role: role.value,
      name: name.value,
      place: where.value,
      date: date.value,
      fixed: fixed.value,
      width: width.value,
    }),
  );
// the choices apply at once, as typing does
watch([date, width], apply);
const close = () => closeDialog(signaturePopover, props.request.close);
</script>

<template>
  <BlockPopover
    id="signature-popover"
    title="Signature"
    :anchor="request.anchor"
    @close="close"
  >
    <label for="signature-popover-role">Role</label>
    <input
      id="signature-popover-role"
      v-model="role"
      type="text"
      autocomplete="off"
      placeholder="e.g. Tenant"
      @input="apply"
    />
    <label for="signature-popover-name">Name</label>
    <input
      id="signature-popover-name"
      v-model="name"
      type="text"
      autocomplete="off"
      :spellcheck="false"
      placeholder="Your name, when you sign"
      @input="apply"
    />
    <label for="signature-popover-place">Place</label>
    <input
      id="signature-popover-place"
      v-model="where"
      type="text"
      autocomplete="off"
      placeholder="Where you sign"
      @input="apply"
    />
    <OptionGroup
      id="signature-popover-date"
      v-model="date"
      name="date"
      label="Date"
      :options="DATE_OPTIONS"
    />
    <input
      v-if="date === 'fixed'"
      id="signature-popover-fixed"
      v-model="fixed"
      type="date"
      aria-label="Fixed date"
      @change="apply"
    />
    <OptionGroup
      id="signature-popover-width"
      v-model="width"
      name="width"
      label="Width"
      :options="WIDTH_OPTIONS"
    />
  </BlockPopover>
</template>
