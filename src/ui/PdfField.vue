<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from "vue";

import type { Frame } from "../engine/frames";
import { commitFill } from "../pdf/fills";
import { prefillText } from "../pdf/placeActions";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import {
  choiceText,
  fieldValue,
  placeElementId,
  placeLabel,
} from "../pdf/placeModel";
import { type FieldPlace, prefillOf } from "../pdf/places";
import { fillsOf } from "../pdf/stampBooks";
import {
  activeTabId,
  fieldProblem,
  lastPlace,
  type MenuItem,
  stampBooks,
} from "../state";
import MenuButton from "./components/MenuButton.vue";
import { fieldKeyStays, radioBoxes } from "./pdfFieldModel";
import { styleOf } from "./rect";
import { stampBox } from "./stampOverlayModel";

// A field of a PDF's form on its page (PdfView.vue). A text field's input
// shows only while it has the focus, prefilled with the user's name, today's
// date or their place when its label asks for one; otherwise the page shows
// MuPDF's drawing of what it holds. Enter, Tab or leaving it fills it in
// (`commitFill`), and a value its font can't show is refused under it. A
// checkbox ticks, a radio button chooses, and a combo or list box opens a
// select of its options.
const props = defineProps<{
  place: FieldPlace;
  // the page it shows on
  frame: Frame;
  // CSS pixels per point
  scale: number;
}>();

const field = computed(() => props.place.field);
const box = computed(() =>
  stampBox(props.place.rect, props.frame, props.scale),
);
const id = computed(() => placeElementId(props.place.id));
const label = computed(() => placeLabel(props.place));
const value = computed(() => {
  void stampBooks.value;
  const tab = activeTabId.value;
  return fieldValue(field.value, tab ? fillsOf(tab) : []);
});
const problem = computed(() => {
  const shown = fieldProblem.value;
  return shown?.tab === activeTabId.value && shown?.field === field.value.name
    ? shown.text
    : "";
});
const problemId = computed(() => `${id.value}-problem`);

const pages = () => document.getElementById(PDF_VIEW_ID);
const input = useTemplateRef<HTMLInputElement | HTMLTextAreaElement>("input");

// what's typed while the input has the focus, and what it started with
const draft = shallowRef("");
const editing = shallowRef(false);
// what Blank suggested, which only Enter or typing fills in: Tab through a
// field leaves it as it was
let suggested: string | null = null;

const onFocus = () => {
  lastPlace.value = props.place.id;
  if (editing.value) return;
  editing.value = true;
  const now = typeof value.value === "string" ? value.value : "";
  suggested = now ? null : prefillText(prefillOf(field.value)) || null;
  draft.value = now || (suggested ?? "");
  // selected, to type over it
  void nextTick(() => input.value?.select());
};
const commit = () => {
  suggested = null;
  void commitFill(field.value, draft.value);
};
const onBlur = () => {
  editing.value = false;
  if (draft.value !== suggested) commit();
};
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    // what was typed goes; the pages take the focus
    draft.value = typeof value.value === "string" ? value.value : "";
    suggested = draft.value;
    editing.value = false;
    pages()?.focus();
    return;
  }
  if (
    event.key === "Enter" &&
    !(field.value.flags.multiline && !event.ctrlKey && !event.metaKey)
  ) {
    event.preventDefault();
    event.stopPropagation();
    commit();
    return;
  }
  if (fieldKeyStays(event)) event.stopPropagation();
};

// a checkbox ticks or not; a radio button is chosen
const toggle = () => void commitFill(field.value, value.value !== true);
const choose = (onValue: string) => void commitFill(field.value, onValue);
const onButtonKey = (event: KeyboardEvent, run: () => void) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    run();
  }
};
const radios = computed(() =>
  radioBoxes(field.value, props.place.page, props.place.rect, props.scale),
);

// a combo or list box: its options as a select
const choices = (): MenuItem[] =>
  field.value.options.map((option) => ({
    id: option,
    label: option,
    radio: true,
    checked: value.value === option,
    run: () => void commitFill(field.value, option),
  }));
const refocusChoice = () => document.getElementById(id.value)?.focus();
const onChoiceKey = (event: KeyboardEvent) => {
  if (fieldKeyStays(event)) event.stopPropagation();
};
</script>

<template>
  <template v-if="place.kind === 'text'">
    <textarea
      v-if="field.flags.multiline"
      :id="id"
      ref="input"
      v-model="draft"
      class="pdf-field"
      :class="{ editing }"
      :aria-label="label"
      :maxlength="field.flags.maxLen ?? undefined"
      :aria-invalid="problem ? true : undefined"
      :aria-describedby="problem ? problemId : undefined"
      :style="styleOf(box)"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      @pointerdown.stop
    />
    <input
      v-else
      :id="id"
      ref="input"
      v-model="draft"
      type="text"
      class="pdf-field"
      :class="{ editing }"
      :aria-label="label"
      :maxlength="field.flags.maxLen ?? undefined"
      :aria-invalid="problem ? true : undefined"
      :aria-describedby="problem ? problemId : undefined"
      :style="styleOf(box)"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      @pointerdown.stop
    />
  </template>
  <button
    v-else-if="place.kind === 'checkbox'"
    :id="id"
    type="button"
    role="checkbox"
    class="pdf-field pdf-check"
    :aria-label="label"
    :aria-checked="value === true"
    :style="styleOf(box)"
    @click="toggle"
    @keydown="onButtonKey($event, toggle)"
    @focus="lastPlace = place.id"
    @pointerdown.stop
  />
  <div
    v-else-if="place.kind === 'radio'"
    :id="id"
    role="radiogroup"
    class="pdf-radios"
    :aria-label="label"
    :style="styleOf(box)"
    @focusin="lastPlace = place.id"
    @pointerdown.stop
  >
    <button
      v-for="radio in radios"
      :key="radio.value"
      type="button"
      role="radio"
      class="pdf-field pdf-check"
      :aria-label="radio.value"
      :aria-checked="value === radio.value"
      :style="styleOf(radio.box)"
      @click="choose(radio.value)"
      @keydown="onButtonKey($event, () => choose(radio.value))"
    />
  </div>
  <span
    v-else
    class="pdf-choice-slot"
    :style="styleOf(box)"
    @keydown="onChoiceKey"
    @focusin="lastPlace = place.id"
    @pointerdown.stop
  >
    <MenuButton
      :id="id"
      class="select pdf-choice"
      :label="label"
      :text="choiceText(value)"
      :items="choices"
      :refocus="refocusChoice"
    />
  </span>
  <p
    v-if="problem"
    :id="problemId"
    class="pdf-field-problem"
    role="alert"
    :style="
      styleOf({ ...box, top: box.top + box.height + 4, height: undefined })
    "
  >
    {{ problem }}
  </p>
</template>
