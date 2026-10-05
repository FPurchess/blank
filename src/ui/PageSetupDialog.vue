<script setup lang="ts">
import {
  type ComponentPublicInstance,
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
  type PageChoices,
  paperOptions,
  settingsOf,
  sizeChoices,
  turned,
  typedOrientation,
} from "../layout/choices";
import { describePaper } from "../layout/describe";
import { type Layout, layoutOf } from "../layout/resolve";
import type { Orientation } from "../layout/settings";
import { thumbnailSvg } from "../layout/thumbnail";
import type { Chosen } from "./optionGroupModel";
import { paperUnit } from "../layout/units";
import {
  closeDialog,
  type MenuItem,
  type PageBase,
  pageSetup,
  type PageSetupRequest,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import MenuButton from "./components/MenuButton.vue";
import OptionGroup from "./components/OptionGroup.vue";
import SettingRow from "./components/SettingRow.vue";
import LengthFields from "./LengthFields.vue";
import {
  MARGIN_FIELDS,
  PAPER_FIELDS,
  sentence,
  stopAfter,
  stopsIn,
} from "./pageSetupModel";

// The page setup dialog (see src/editor/commands/pageSetup.ts): rows for the
// paper, the orientation, the margins and the headings that start a new page,
// which ↑↓ move between and ←→ change, with a picture of the page. The paper
// is a list, custom sizes and margins are typed in below their row. "Edit as
// text" edits the whole frontmatter instead, for what the rows don't offer,
// and "Edit as options" goes back to the rows with what the text says.
const props = defineProps<{ request: PageSetupRequest }>();
const { locale, unit } = props.request;

// the headers and footers, which the dialog keeps as they are, stay out of
// the reactive choices, so the settings it applies hold no proxies
const { bands: openedBands, ...shown } = choicesOf(
  props.request.settings,
  locale,
  unit,
);
const choices = reactive(shown);
const bands = shallowRef(openedBands);
// what the choices are written onto: the document's frontmatter, or the
// text last edited
const base = shallowRef<PageBase>({
  frontmatter: props.request.frontmatter,
  settings: props.request.settings,
});
const warnings = shallowRef(props.request.warnings);

const result = computed(() =>
  settingsOf({ ...choices, bands: bands.value }, locale, unit),
);
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

// the same list on every render
const PAPER_OPTIONS = paperOptions(locale);
const paperLabel = computed(
  () => PAPER_OPTIONS.find((option) => option.value === choices.paper)?.label,
);
const paper = useTemplateRef<ComponentPublicInstance>("paper");
const focusPaper = () => (paper.value?.$el as HTMLElement | undefined)?.focus();

const asText = shallowRef(false);
const text = shallowRef("");
// what is wrong with the text, once it was read
const textError = shallowRef("");
// what is wrong, by the part it is wrong in, each a sentence on its own line
const errors = computed<[string, string][]>(() => {
  if (asText.value) return textError.value ? [["text", textError.value]] : [];
  return "errors" in result.value ? Object.entries(result.value.errors) : [];
});
// the id of the error of a part, which its fields are described by
const errorId = (part: string) =>
  errors.value.some(([name]) => name === part)
    ? `page-setup-error-${part}`
    : undefined;
const blocked = computed(() => !asText.value && chosen.value === null);

const settings = useTemplateRef<HTMLElement>("settings");
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
const focusFirst = () => stopsIn(settings.value!)[0]?.focus();
onMounted(focusFirst);

const choosePaper = async (value: PageChoices["paper"]) => {
  if (value === "custom" && choices.paper !== "custom" && layout.value) {
    // start from the paper chosen so far
    Object.assign(
      choices,
      sizeChoices(layout.value.paper, choices.orientation, unit),
    );
  }
  choices.paper = value;
  if (value === "custom") {
    await nextTick();
    settings.value?.querySelector<HTMLInputElement>(".custom input")?.focus();
  }
};

const paperItems = (): MenuItem[] =>
  PAPER_OPTIONS.map((option) => ({
    id: option.value,
    label: option.label,
    radio: true,
    checked: option.value === choices.paper,
    run: () => void choosePaper(option.value),
  }));

// a custom size turns with the orientation, and the orientation follows a
// size typed wider than high
const turn = (value: Chosen<Orientation>) => {
  // a radio group's value, never a list
  const orientation = value as Orientation;
  if (choices.paper === "custom") {
    Object.assign(choices, turned(choices, orientation, unit));
  }
  choices.orientation = orientation;
};
const setSize = (key: "width" | "height", value: string) => {
  choices[key] = value;
  choices.orientation = typedOrientation(choices, unit) ?? choices.orientation;
};
const setSide = (key: keyof PageChoices["sides"], value: string) => {
  choices.sides[key] = value;
};

// ↑↓ move between the rows and the visible fields before the paper's list
// sees them, which opens on ↓; Alt+↓ is left to it
const onArrows = (event: KeyboardEvent) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const next = stopAfter(
    stopsIn(settings.value!),
    document.activeElement,
    event.key === "ArrowDown" ? 1 : -1,
  );
  if (next) {
    event.preventDefault();
    event.stopPropagation();
    next.focus();
  }
};

// Enter on an option applies, instead of pressing it, while on the paper's
// list it opens it; ←→ choose the paper, as they change the other rows
const onKeydown = (event: KeyboardEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const list = target.getAttribute("aria-haspopup") === "menu";
  if (event.key === "Enter" && !list) {
    event.preventDefault();
    target.form!.requestSubmit();
  } else if (
    list &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    const index = PAPER_OPTIONS.findIndex((o) => o.value === choices.paper);
    const next = PAPER_OPTIONS[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (next) void choosePaper(next.value);
  }
};

const close = (callback: () => void) => closeDialog(pageSetup, callback);

// the text with the choices written in, or the rows with what the text says
const switchMode = async () => {
  if (!asText.value) {
    if (!chosen.value) return;
    text.value = props.request.textOf(chosen.value, base.value);
    textError.value = "";
    asText.value = true;
    await nextTick();
    textarea.value?.focus();
    return;
  }
  const read = props.request.readText(text.value);
  if ("error" in read) {
    textError.value = read.error;
    return;
  }
  const { bands: readBands, ...rows } = choicesOf(read.settings, locale, unit);
  Object.assign(choices, rows);
  bands.value = readBands;
  base.value = { frontmatter: text.value, settings: read.settings };
  warnings.value = read.warnings;
  asText.value = false;
  await nextTick();
  focusFirst();
};

const makeDefault = () => {
  const settings = chosen.value;
  if (settings) close(() => props.request.makeDefault(settings));
};

const submit = () => {
  if (asText.value) {
    const read = props.request.readText(text.value);
    if ("error" in read) textError.value = read.error;
    else close(() => props.request.applyText(text.value));
    return;
  }
  const settings = chosen.value;
  if (settings) close(() => props.request.apply(settings, base.value));
};
</script>

<template>
  <BaseDialog
    id="page-setup"
    title="Page setup"
    form-class="page-setup"
    :described-by="warnings.length ? 'page-setup-warnings' : undefined"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <div class="layout">
      <div class="main">
        <div
          id="page-setup-warnings"
          class="warning"
          :hidden="warnings.length === 0"
        >
          <p v-for="warning in warnings" :key="warning">
            {{ sentence(warning) }}
          </p>
        </div>
        <div
          ref="settings"
          class="settings"
          :hidden="asText"
          @keydown.capture="onArrows"
          @keydown="onKeydown"
        >
          <SettingRow id="page-setup-paper-label" name="paper" label="Paper">
            <MenuButton
              id="page-setup-paper"
              ref="paper"
              class="select"
              label="Paper"
              :text="paperLabel"
              :items="paperItems"
              :refocus="focusPaper"
            />
          </SettingRow>
          <LengthFields
            name="paper"
            :fields="PAPER_FIELDS"
            :values="choices"
            :unit="paperUnit(unit)"
            :error-id="errorId('paper')"
            :hidden="choices.paper !== 'custom'"
            @update="setSize"
          />
          <OptionGroup
            id="page-setup-orientation"
            :model-value="choices.orientation"
            name="orientation"
            label="Orientation"
            :options="ORIENTATION_OPTIONS"
            @update:model-value="turn"
          />
          <OptionGroup
            id="page-setup-margins"
            v-model="choices.margins"
            name="margins"
            label="Margins"
            :options="MARGIN_OPTIONS"
          />
          <LengthFields
            name="margins"
            :fields="MARGIN_FIELDS"
            :values="choices.sides"
            :unit="unit"
            :error-id="errorId('margins')"
            :hidden="choices.margins !== 'custom'"
            @update="setSide"
          />
          <OptionGroup
            id="page-setup-newPageBefore"
            v-model="choices.newPageBefore"
            name="newPageBefore"
            label="New page before"
            :options="HEADING_OPTIONS"
          />
          <p class="note">
            Kept in this document. Headers and footers are set on the pages.
          </p>
        </div>
        <div class="text-editor" :hidden="!asText">
          <label for="page-setup-text">Properties at the top of the file</label>
          <textarea
            id="page-setup-text"
            ref="textarea"
            v-model="text"
            spellcheck="false"
            :aria-invalid="errorId('text') ? true : undefined"
            :aria-describedby="errorId('text')"
            @input="textError = ''"
          />
        </div>
        <div
          id="page-setup-errors"
          class="error"
          aria-live="polite"
          :hidden="errors.length === 0"
        >
          <p
            v-for="[part, message] in errors"
            :id="`page-setup-error-${part}`"
            :key="part"
          >
            {{ message }}
          </p>
        </div>
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
    <template #secondary>
      <button type="button" :disabled="blocked" @click="switchMode">
        {{ asText ? "Edit as options" : "Edit as text" }}
      </button>
    </template>
    <template #actions>
      <button
        type="button"
        :hidden="asText"
        :disabled="blocked"
        @click="makeDefault"
      >
        Make this my default
      </button>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button type="submit" :disabled="blocked">Apply</button>
    </template>
  </BaseDialog>
</template>
