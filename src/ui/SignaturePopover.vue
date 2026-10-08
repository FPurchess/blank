<script setup lang="ts">
import { onMounted, onUpdated, shallowRef, useTemplateRef } from "vue";

import { place } from "../popup";
import {
  closeDialog,
  signaturePopover,
  type SignaturePopoverRequest,
} from "../state";
import { useDismiss } from "./composables/useDismiss";
import { anchorOf, SETTINGS_BUTTON } from "./tocPopoverModel";
import {
  DATE_OPTIONS,
  dateChoiceOf,
  settingsOf,
  today,
  WIDTH_OPTIONS,
} from "./signaturePopoverModel";

// The settings of a signature block, below the toolbar's settings button
// (Enter or a click on it, see src/editor/commands/contentBlocks.ts): who
// signs and as what, where and when, and how wide it is. Each change
// applies at once, as one undo step; Esc, Enter in a field or a click
// elsewhere closes them, and the focus goes back to the block.
const props = defineProps<{ request: SignaturePopoverRequest }>();

const root = useTemplateRef<HTMLElement>("root");
const roleField = useTemplateRef<HTMLInputElement>("roleField");
const start = props.request.settings;
const role = shallowRef(start.role);
const name = shallowRef(start.name);
const where = shallowRef(start.place);
const date = shallowRef(dateChoiceOf(start.date));
const fixed = shallowRef(date.value === "fixed" ? start.date : today());
const width = shallowRef(start.width ?? "");

const placeIt = () =>
  place(root.value!, anchorOf(props.request.anchor), { align: "end" });
onMounted(() => {
  placeIt();
  roleField.value!.focus();
});
onUpdated(placeIt);

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
const close = () => closeDialog(signaturePopover, props.request.close);

// Enter in a text field closes them
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    close();
  }
};

// as the table of contents' settings, see TocPopover.vue
useDismiss(() => [root.value, document.querySelector(SETTINGS_BUTTON)], close, {
  escape: true,
  resize: true,
});
</script>

<template>
  <div
    id="signature-popover"
    ref="root"
    class="signature-popover"
    role="dialog"
    aria-labelledby="signature-popover-title"
    @keydown="onKeyDown"
  >
    <h2 id="signature-popover-title">Signature</h2>
    <label for="signature-popover-role">Role</label>
    <input
      id="signature-popover-role"
      ref="roleField"
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
    <label for="signature-popover-date">Date</label>
    <select id="signature-popover-date" v-model="date" @change="apply">
      <option
        v-for="option in DATE_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <input
      v-if="date === 'fixed'"
      id="signature-popover-fixed"
      v-model="fixed"
      type="date"
      aria-label="Fixed date"
      @change="apply"
    />
    <label for="signature-popover-width">Width</label>
    <select id="signature-popover-width" v-model="width" @change="apply">
      <option
        v-for="option in WIDTH_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>
