<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  shallowRef,
  useTemplateRef,
} from "vue";

import {
  choicesOf,
  HEADING_OPTIONS,
  MARGIN_OPTIONS,
  ORIENTATION_OPTIONS,
  paperOptions,
  settingsOf,
} from "../layout/choices";
import { describePaper } from "../layout/describe";
import { type Layout, layoutOf } from "../layout/resolve";
import { thumbnailSvg } from "../layout/thumbnail";
import { pageSetup, type PageSetupRequest } from "../state";
import { closeDialog } from "./closeDialog";
import BaseDialog from "./components/BaseDialog.vue";
import OptionGroup from "./components/OptionGroup.vue";
import TextField from "./components/TextField.vue";
import {
  MARGIN_FIELDS,
  PAPER_FIELDS,
  stopAfter,
  stopsIn,
} from "./pageSetupModel";

// The page setup dialog (see src/editor/commands/pageSetup.ts): a row of
// choices for the paper, the orientation, the margins and the headings that
// start a new page, which ↑↓ move between and ←→ change, with a picture of
// the page. Custom sizes and margins are typed in below their row. "Edit as
// Text" edits the whole frontmatter instead, for what the rows don't offer.
const props = defineProps<{ request: PageSetupRequest }>();
const { locale, unit } = props.request;

// the headers and footers, which the dialog keeps as they are, stay out of
// the reactive choices, so the settings it applies hold no proxies
const { bands, ...shown } = choicesOf(props.request.settings, locale, unit);
const choices = reactive(shown);
const result = computed(() => settingsOf({ ...choices, bands }, locale, unit));
const chosen = computed(() =>
  "settings" in result.value ? result.value.settings : null,
);
// the page the choices describe, or the last one they did while they don't
const layout = computed<Layout | undefined>((previous) =>
  chosen.value ? layoutOf(chosen.value, locale) : previous,
);
// drawn only when the page changes, not on every key in a field
const picture = computed(() => layout.value && thumbnailSvg(layout.value));
const caption = computed(
  () => layout.value && describePaper(layout.value, unit),
);
// the same list on every render, so the row doesn't re-render while typing
const PAPER_OPTIONS = paperOptions(locale);

const asText = shallowRef(false);
const text = shallowRef(props.request.frontmatter ?? "");
// what is wrong with the text, once Apply found it
const textError = shallowRef("");
const errors = computed(() => {
  if (asText.value) return textError.value;
  return "errors" in result.value
    ? Object.values(result.value.errors).join(". ")
    : "";
});
const blocked = computed(() => !asText.value && chosen.value === null);

const settings = useTemplateRef<HTMLElement>("settings");
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
onMounted(() => stopsIn(settings.value!)[0]?.focus());

// ↑↓ move between the rows and the visible fields, Enter on an option applies
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const next = stopAfter(
      stopsIn(settings.value!),
      document.activeElement,
      event.key === "ArrowDown" ? 1 : -1,
    );
    if (next) {
      event.preventDefault();
      next.focus();
    }
  } else if (
    event.key === "Enter" &&
    event.target instanceof HTMLButtonElement
  ) {
    // instead of pressing the option
    event.preventDefault();
    event.target.form!.requestSubmit();
  }
};

const close = (callback: () => void) => closeDialog(pageSetup, callback);

const editAsText = async () => {
  asText.value = true;
  await nextTick();
  textarea.value?.focus();
};

const makeDefault = () => {
  const settings = chosen.value;
  if (settings) close(() => props.request.makeDefault(settings));
};

const submit = () => {
  if (asText.value) {
    const error = props.request.applyText(text.value);
    // applyText has given the editor the focus back
    if (error === null) pageSetup.value = null;
    else textError.value = error;
    return;
  }
  const settings = chosen.value;
  if (settings) close(() => props.request.apply(settings));
};
</script>

<template>
  <BaseDialog
    id="page-setup"
    title="Page setup"
    form-class="page-setup"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <p class="warning" :hidden="request.warnings.length === 0">
      {{ request.warnings.join(". ") }}
    </p>
    <div class="body">
      <div
        ref="settings"
        class="settings"
        :hidden="asText"
        @keydown="onKeydown"
      >
        <OptionGroup
          id="page-setup-paper"
          v-model="choices.paper"
          name="paper"
          label="Paper"
          :options="PAPER_OPTIONS"
        />
        <div
          class="custom"
          data-fields="paper"
          :hidden="choices.paper !== 'custom'"
        >
          <div v-for="field in PAPER_FIELDS" :key="field.key">
            <TextField
              :id="`page-setup-paper-${field.key}`"
              v-model="choices[field.key]"
              :label="`${field.label} (${unit})`"
              inputmode="decimal"
            />
          </div>
        </div>
        <OptionGroup
          id="page-setup-orientation"
          v-model="choices.orientation"
          name="orientation"
          label="Orientation"
          :options="ORIENTATION_OPTIONS"
        />
        <OptionGroup
          id="page-setup-margins"
          v-model="choices.margins"
          name="margins"
          label="Margins"
          :options="MARGIN_OPTIONS"
        />
        <div
          class="custom"
          data-fields="margins"
          :hidden="choices.margins !== 'custom'"
        >
          <div v-for="field in MARGIN_FIELDS" :key="field.key">
            <TextField
              :id="`page-setup-margins-${field.key}`"
              v-model="choices.sides[field.key]"
              :label="`${field.label} (${unit})`"
              inputmode="decimal"
            />
          </div>
        </div>
        <OptionGroup
          id="page-setup-newPageBefore"
          v-model="choices.newPageBefore"
          name="newPageBefore"
          label="New page before"
          :options="HEADING_OPTIONS"
        />
      </div>
      <div class="text-editor" :hidden="!asText">
        <label for="page-setup-text">Properties at the top of the file</label>
        <textarea
          id="page-setup-text"
          ref="textarea"
          v-model="text"
          spellcheck="false"
          @input="textError = ''"
        />
      </div>
      <figure class="thumbnail" :hidden="asText">
        <template v-if="picture">
          <!-- the SVG is drawn by thumbnailSvg, which escapes all text -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="picture" v-html="picture" />
          <figcaption>{{ caption }}</figcaption>
        </template>
      </figure>
    </div>
    <p
      id="page-setup-errors"
      class="error"
      aria-live="polite"
      :hidden="!errors"
    >
      {{ errors }}
    </p>
    <p class="hint" :hidden="asText">
      ↑↓ choose · ←→ change · Space switch a heading · Enter apply · Esc cancel
    </p>
    <template #actions>
      <button type="button" :hidden="asText" @click="editAsText">
        Edit as Text
      </button>
      <button
        type="button"
        :hidden="asText"
        :disabled="blocked"
        @click="makeDefault"
      >
        Make This My Default
      </button>
      <button type="submit" :disabled="blocked">Apply</button>
      <button type="button" @click="close(request.cancel)">Cancel</button>
    </template>
  </BaseDialog>
</template>
