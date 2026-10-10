<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
} from "vue";

import { logError } from "../log";

import {
  closeDialog,
  signatureDialog,
  type SignatureDialogRequest,
} from "../state";
import type { MarkSource } from "../signing/profile";
import {
  FONT_STYLES,
  loadSignatureFonts,
  SIGNATURE_FONTS,
  type SignatureFont,
} from "../signing/fonts";
import type { Stroke } from "../signing/pad";
import BaseDialog from "./components/BaseDialog.vue";
import SegmentedTabs from "./components/SegmentedTabs.vue";
import SwitchControl from "./components/SwitchControl.vue";
import TextField from "./components/TextField.vue";
import SignaturePad from "./SignaturePad.vue";
import { useRovingFocus } from "./composables/useRovingFocus";
import {
  PAD_TABS,
  type PadTab,
  problemOf,
  sampleOf,
  startOf,
  titleOf,
} from "./signatureDialogModel";

// The user's signature or initials (see src/editor/commands/signing.ts),
// drawn on a pad, typed in one of the signature fonts, or from a picture of
// it on paper, whose background is removed. Saved once on this computer,
// for every signature to come.
const props = defineProps<{ request: SignatureDialogRequest }>();

const start = startOf(
  props.request.mark,
  props.request.saved,
  props.request.name,
);
const tab = shallowRef<PadTab>(start.tab);
const strokes = shallowRef<Stroke[]>(start.strokes);
const text = shallowRef(start.text);
const font = shallowRef<SignatureFont>(start.font);
// the saved picture shows on Image as it was saved, and saving it again
// unchanged keeps it, rather than cleaning the cleaned picture once more
const savedImage =
  start.tab === "image" ? (props.request.saved?.png ?? null) : null;
const image = shallowRef<string | null>(savedImage);
const clean = shallowRef(true);
const choosing = shallowRef(false);
const saving = shallowRef(false);
const submitted = shallowRef(false);
const problem = computed(() =>
  submitted.value
    ? problemOf(tab.value, props.request.mark, {
        strokes: strokes.value,
        text: text.value,
        image: image.value,
      })
    : "",
);

onMounted(() => {
  void loadSignatureFonts();
  // the focus starts on the tab shown, so Esc and Tab stay in the dialog
  document
    .querySelector<HTMLElement>(
      "#signature-dialog [role=tab][aria-selected=true]",
    )
    ?.focus();
});

// the font choices are a radio group in a column: every arrow chooses the
// next or the one before
const fonts = useTemplateRef<HTMLElement>("fonts");
const { onKeydown: moveFont, follow: followFont } = useRovingFocus(
  () => fonts.value,
  "[role=radio]",
  SIGNATURE_FONTS.indexOf(start.font),
  (index) => (font.value = SIGNATURE_FONTS[index]),
  "both",
);
// the dialog may close while the native file dialog is open
let closed = false;
onUnmounted(() => (closed = true));

const chooseFile = async () => {
  choosing.value = true;
  const chosen = await props.request.chooseFile().catch((error: unknown) => {
    logError("failed to choose a picture of the signature", error);
    return null;
  });
  choosing.value = false;
  if (!closed && chosen) image.value = chosen.src;
};

const close = (callback: () => void) => closeDialog(signatureDialog, callback);
// a mark being saved can't be cancelled: it would still be saved
const cancel = () => {
  if (!saving.value) close(props.request.cancel);
};

const sourceOf = (): MarkSource =>
  tab.value === "draw"
    ? { kind: "draw", strokes: strokes.value }
    : tab.value === "type"
      ? { kind: "type", text: text.value.trim(), font: font.value }
      : { kind: "image" };

const submit = async () => {
  submitted.value = true;
  if (problem.value || saving.value) return;
  // the saved picture, as it was: nothing to make again
  if (tab.value === "image" && image.value === savedImage) {
    close(props.request.done);
    return;
  }
  saving.value = true;
  const chosen =
    tab.value === "image" && image.value
      ? { src: image.value, clean: clean.value }
      : undefined;
  const saved = await props.request
    .submit(sourceOf(), chosen)
    .catch((error: unknown) => {
      logError("failed to save the signature", error);
      return false;
    });
  saving.value = false;
  if (saved && !closed) close(props.request.done);
};
// what is wrong, for the field or control it is about
const errorId = computed(() =>
  problem.value ? "signature-dialog-error" : undefined,
);
const what = props.request.mark;
</script>

<template>
  <BaseDialog
    id="signature-dialog"
    :title="titleOf(request.mark)"
    form-class="signature-dialog"
    @submit="submit"
    @cancel="cancel"
  >
    <SegmentedTabs v-model="tab" label="How to sign" :items="PAD_TABS" />
    <div v-if="tab === 'draw'" class="signature-panel">
      <SignaturePad
        v-model="strokes"
        :label="`Draw your ${what}`"
        :error-id="errorId"
      />
      <div class="signature-panel-foot">
        <button
          type="button"
          class="quiet"
          :disabled="strokes.length === 0"
          @click="strokes = []"
        >
          Clear
        </button>
      </div>
    </div>
    <div v-else-if="tab === 'type'" class="signature-panel">
      <TextField
        id="signature-dialog-name"
        v-model="text"
        :label="request.mark === 'signature' ? 'Name' : 'Initials'"
        :error-id="errorId"
      />
      <div
        ref="fonts"
        class="signature-fonts"
        role="radiogroup"
        aria-label="Style"
        @keydown="moveFont"
      >
        <button
          v-for="choice in SIGNATURE_FONTS"
          :key="choice"
          type="button"
          role="radio"
          class="signature-font"
          :aria-checked="font === choice"
          :tabindex="font === choice ? 0 : -1"
          @click="
            font = choice;
            followFont($event.currentTarget);
          "
        >
          <span
            class="signature-font-sample"
            :style="{ fontFamily: `'${choice}', cursive` }"
          >
            {{ text.trim() || sampleOf(request.mark) }}
          </span>
          <span class="signature-font-name"
            >{{ FONT_STYLES[choice] }} · {{ choice }}</span
          >
        </button>
      </div>
    </div>
    <div v-else class="signature-panel">
      <div class="signature-image">
        <img v-if="image" :src="image" :alt="`Your ${what} as chosen`" />
        <span v-else class="note"
          >A photo or scan of your {{ what }} on white paper.</span
        >
        <button
          type="button"
          :disabled="choosing"
          :aria-describedby="errorId"
          @click="chooseFile"
        >
          {{ image ? "Choose another image…" : "Choose image…" }}
        </button>
      </div>
      <SwitchControl v-model="clean">Remove background</SwitchControl>
      <p class="note">
        Keeps only the ink and trims the edges. Turn it off for a picture that
        already has a transparent background.
      </p>
    </div>
    <p id="signature-dialog-error" class="error" aria-live="polite">
      {{ problem }}
    </p>
    <template #actions>
      <button type="button" :disabled="saving" @click="cancel">Cancel</button>
      <button type="submit" :disabled="saving">Save</button>
    </template>
  </BaseDialog>
</template>
