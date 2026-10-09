<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { CommandIdentifier } from "../config";
import type { Option } from "../layout/choices";
import { isWindows } from "../platform";
import {
  chosenPages,
  type Destination,
  effectiveLayout,
  MAX_COPIES,
  type PageChoice,
  sheetLabel,
  summary,
} from "../print/printModel";
import { type PerSheet, printSheets, type Scale } from "../print/sheets";
import {
  closeDialog,
  printDialog,
  type PrintRequest,
  printSettings,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import IconGlyph from "./components/IconGlyph.vue";
import OptionGroup from "./components/OptionGroup.vue";
import SettingRow from "./components/SettingRow.vue";
import SwitchControl from "./components/SwitchControl.vue";
import TextField from "./components/TextField.vue";
import DisclosureButton from "./DisclosureButton.vue";
import NumberStepper from "./NumberStepper.vue";
import { appliesOnEnter } from "./optionGroupModel";
import PrintPreview from "./PrintPreview.vue";
import { tipAttrs } from "./tooltipModel";

// The print dialog (see src/editor/commands/print.ts): the sheets that will
// print on the left, the options Blank's engine controls on the right. The
// system's print dialog, which opens next, chooses the printer. Enter prints
// from a field or an option, unless the pages typed are wrong; other buttons
// take it themselves.
const props = defineProps<{ request: PrintRequest }>();

const remembered = printSettings.value;
const choices = reactive({
  destination: props.request.destination ?? remembered.destination,
  perSheet: remembered.perSheet,
  scale: remembered.scale,
  more: remembered.more,
  // these start over each time
  copies: 1,
  collate: true,
  pages: "all" as PageChoice,
  custom: "",
  sheet: 0,
});

const DESTINATIONS: Option<Destination>[] = [
  { value: "printer", label: "Printer", icon: "print" },
  { value: "pdf", label: "PDF file", icon: "pdf" },
];
const PAGE_CHOICES: Option<PageChoice>[] = [
  { value: "all", label: "All" },
  {
    value: "current",
    label: "Current page",
    tip: `Page ${props.request.current + 1}, where the cursor is`,
  },
  { value: "custom", label: "Custom" },
];
const PER_SHEET: Option<PerSheet>[] = [1, 2, 4].map((value) => ({
  value: value as PerSheet,
  label: String(value),
}));
const SCALES: Option<Scale>[] = [
  { value: "actual", label: "Actual size" },
  { value: "fit", label: "Fit to paper" },
];

const toPrinter = computed(() => choices.destination === "printer");
const chosen = computed(() =>
  chosenPages(
    choices.pages,
    props.request.pages,
    props.request.current,
    choices.custom,
  ),
);
// the pages to print, by their index, null while the pages typed are wrong
const pages = computed(() =>
  "pages" in chosen.value ? chosen.value.pages : null,
);
const layout = computed(() =>
  effectiveLayout(choices.destination, choices.perSheet, choices.scale),
);
const sheets = computed(() =>
  pages.value
    ? printSheets({
        pages: pages.value,
        page: props.request.page,
        ...layout.value,
      })
    : [],
);
// the preview starts again on the first sheet once other pages print
watch(
  () => [choices.pages, choices.custom, choices.destination, choices.perSheet],
  () => (choices.sheet = 0),
);
// the sheet the preview shows, among those there are
const sheet = computed({
  get: () => Math.min(choices.sheet, Math.max(sheets.value.length - 1, 0)),
  set: (index: number) => (choices.sheet = index),
});
const label = computed(() =>
  sheetLabel({
    sheets: sheets.value,
    index: sheet.value,
    total: props.request.pages,
    perSheet: layout.value.perSheet,
    all: pages.value?.length === props.request.pages,
  }),
);
const summed = computed(() =>
  pages.value
    ? summary({
        pages: pages.value.length,
        sheets: sheets.value.length,
        perSheet: layout.value.perSheet,
        copies: choices.copies,
        destination: choices.destination,
      })
    : "",
);
const note = computed(() =>
  toPrinter.value
    ? "You choose the printer, two-sided printing and color in the next step." +
      (isWindows() ? " Set the copies again in the next step." : "")
    : "Saves the chosen pages as a PDF, the same file Export as PDF writes.",
);

// what is wrong with the pages typed, shown once typing pauses or the field
// is left, and gone as soon as they are right
const ERROR_DELAY = 800;
const error = computed(() =>
  choices.pages === "custom" && "error" in chosen.value
    ? chosen.value.error
    : null,
);
const shownError = shallowRef<string | null>(null);
let errorTimer: ReturnType<typeof setTimeout> | undefined;
const showError = () => {
  clearTimeout(errorTimer);
  shownError.value = error.value;
};
const onCustomInput = () => {
  clearTimeout(errorTimer);
  if (error.value) errorTimer = setTimeout(showError, ERROR_DELAY);
  else shownError.value = null;
};
onUnmounted(() => clearTimeout(errorTimer));

const custom = useTemplateRef<InstanceType<typeof TextField>>("custom");
const choosePages = async (choice: PageChoice) => {
  choices.pages = choice;
  if (choice !== "custom") {
    shownError.value = null;
    return;
  }
  await nextTick();
  custom.value?.select();
};

const submitButton = useTemplateRef<HTMLButtonElement>("submitButton");
onMounted(() => submitButton.value?.focus());

const preview = useTemplateRef<InstanceType<typeof PrintPreview>>("preview");
// Enter on an option prints, instead of pressing it, and in the pages typed
// says at once what is wrong with them, where it can't print; PageUp and
// PageDown page through the preview from anywhere
const onKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  if (event.key === "Enter" && appliesOnEnter(target)) {
    event.preventDefault();
    (target as HTMLButtonElement).form!.requestSubmit();
  } else if (
    event.key === "Enter" &&
    target.id === "print-custom" &&
    error.value
  ) {
    // the disabled Print takes no Enter from a field
    event.preventDefault();
    showError();
  } else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    preview.value?.go(event.key === "PageDown" ? 1 : -1);
  }
};

const close = (callback: () => void) => closeDialog(printDialog, callback);

const submit = () => {
  const chosenPages = pages.value;
  // Enter on an option submits even while Print is disabled
  if (!chosenPages) {
    showError();
    custom.value?.select();
    return;
  }
  const { destination, perSheet, scale, more } = choices;
  printSettings.value = {
    // a destination the dialog opened with after printing failed is
    // remembered only once chosen
    destination:
      destination === props.request.destination
        ? remembered.destination
        : destination,
    perSheet,
    scale,
    more,
  };
  close(() =>
    destination === "pdf"
      ? props.request.savePdf(chosenPages)
      : props.request.print({
          pages: chosenPages,
          ...layout.value,
          copies: choices.copies,
          collate: choices.collate,
        }),
  );
};
</script>

<template>
  <BaseDialog
    id="print"
    title="Print"
    form-class="print"
    :described-by="request.note ? 'print-note' : undefined"
    @submit="submit"
    @cancel="close(request.cancel)"
    @keydown="onKeydown"
  >
    <div class="print-body">
      <PrintPreview
        ref="preview"
        v-model="sheet"
        :sheets="sheets"
        :page="request.page"
        :label="label"
      />
      <div class="print-options">
        <OptionGroup
          id="print-destination"
          v-model="choices.destination"
          name="destination"
          label="Destination"
          :options="DESTINATIONS"
        />
        <template v-if="toPrinter">
          <SettingRow id="print-copies-label" name="copies" label="Copies">
            <NumberStepper
              id="print-copies"
              v-model="choices.copies"
              labelledby="print-copies-label"
              :min="1"
              :max="MAX_COPIES"
              decrease-label="Fewer copies"
              increase-label="More copies"
            />
          </SettingRow>
          <SwitchControl v-if="choices.copies > 1" v-model="choices.collate">
            Keep each copy together
          </SwitchControl>
        </template>
        <OptionGroup
          id="print-pages"
          :model-value="choices.pages"
          name="pages"
          label="Pages"
          :options="PAGE_CHOICES"
          @update:model-value="choosePages($event as PageChoice)"
        />
        <div
          v-if="choices.pages === 'custom'"
          class="custom"
          @focusout="showError"
        >
          <TextField
            id="print-custom"
            ref="custom"
            v-model="choices.custom"
            label="Pages to print"
            placeholder="For example 1-3, 5"
            :error-id="shownError ? 'print-custom-error' : undefined"
            @input="onCustomInput"
          />
        </div>
        <!-- always there, so screen readers announce what comes into it -->
        <div class="error" aria-live="polite">
          <p v-if="shownError" id="print-custom-error">
            <IconGlyph name="info" />
            {{ shownError }}
          </p>
        </div>
        <DisclosureButton v-model="choices.more" controls="print-more">
          More settings
        </DisclosureButton>
        <div id="print-more" :hidden="!choices.more">
          <template v-if="toPrinter">
            <OptionGroup
              id="print-per-sheet"
              v-model="choices.perSheet"
              name="perSheet"
              label="Pages per sheet"
              :options="PER_SHEET"
            />
            <OptionGroup
              id="print-scale"
              v-model="choices.scale"
              name="scale"
              label="Scale"
              :options="SCALES"
              aria-describedby="print-scale-hint"
            />
            <p id="print-scale-hint" class="hint">
              Actual size prints the pages as you see them. Fit to paper helps
              when the printer holds other paper than the document's.
            </p>
          </template>
          <SettingRow
            id="print-paper-label"
            name="paper"
            label="Paper"
            aria-describedby="print-paper-hint"
          >
            <span class="paper">{{ request.paper }}</span>
            <button
              type="button"
              class="link"
              v-bind="
                tipAttrs({
                  name: 'Page setup',
                  command: CommandIdentifier.PAGE_SETUP,
                })
              "
              @click="close(request.pageSetup)"
            >
              Page setup…
            </button>
          </SettingRow>
          <p id="print-paper-hint" class="hint">
            The document's page setup decides the paper. Headers, footers and
            page numbers print as they are on the pages.
          </p>
        </div>
        <p
          :id="request.note ? 'print-note' : undefined"
          class="note"
          :class="{ warning: request.note }"
        >
          {{ request.note ?? note }}
        </p>
      </div>
    </div>
    <template #secondary>
      <p class="summary">{{ summed }}</p>
    </template>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button ref="submitButton" type="submit" :disabled="!pages">
        {{ toPrinter ? "Print…" : "Save PDF…" }}
      </button>
    </template>
  </BaseDialog>
</template>
