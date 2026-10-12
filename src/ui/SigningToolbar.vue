<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from "vue";

import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import { engineless } from "../engine/engine";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { readShownRules } from "../pdf/sign";
import { cancelPlacing, placeStamp } from "../pdf/stampActions";
import type { StampKind } from "../pdf/stampModel";
import {
  announce,
  engineMissing,
  FOCUS_ORDER,
  placingStamp,
  shownPdf,
  shownPdfRules,
  signingPlace,
  toolbarFocused,
} from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useRovingFocus } from "./composables/useRovingFocus";
import {
  activatedByKeys,
  type SigningTool,
  signingToolbar,
  signKey,
  signTip,
} from "./signingToolbarModel";
import { tipAttrs } from "./tooltipModel";

// The signing toolbar, in place of the formatting toolbar in a PDF tab (the
// same row, the same F6 stop and Alt-F10): the tools that place stamps,
// Signature, Initials, Date and Place, then Sign… (`pdf.sign`) and a Next
// slot that the found places fill later. From the keyboard a tool places
// its stamp at a default spot of the page in view; a click arms it, and a
// press on a page places it there (Esc cancels). A tool that can't be used
// says why in its tooltip; the toolbar says why when none can.
const editor = useEditor();
const root = useTemplateRef<HTMLElement>("root");

// what the PDF allows, read once it shows
watch(
  () => shownPdf.value?.opened?.sha256,
  () => void readShownRules(),
  { immediate: true },
);

const state = computed(() => {
  const opened = shownPdf.value?.opened ?? null;
  const read = shownPdfRules.value;
  return signingToolbar(
    {
      opened,
      rules: opened && read?.sha256 === opened.sha256 ? read.rules : null,
      engine: !engineMissing.value && !engineless(),
      place: signingPlace.value,
    },
    placingStamp.value,
  );
});

const { current, onKeydown, follow, focusCurrent } = useRovingFocus(
  () => root.value,
  "button",
);
const region = useFocusRegion(() => root.value, toolbarFocused, {
  id: "toolbar",
  order: FOCUS_ORDER.toolbar,
  focus: focusCurrent,
});
// the controls in their order: the tools, then Sign…
const tabindexOf = (index: number) => (index === current.value ? 0 : -1);

const pages = () => document.getElementById(PDF_VIEW_ID);

// the stamp just placed takes the focus, so the arrows move it
const focusStamp = (id: string) =>
  void nextTick(() => document.getElementById(`stamp-${id}`)?.focus());

const use = (tool: SigningTool, event: MouseEvent) => {
  if (tool.refusal) {
    announce(tool.refusal);
    return;
  }
  const kind: StampKind = tool.kind;
  if (activatedByKeys(event)) {
    placingStamp.value = null;
    const back = () => root.value?.focus();
    void placeStamp(kind, null, back).then((stamp) => {
      if (stamp) focusStamp(stamp.id);
    });
    return;
  }
  // a second click puts the tool down again
  if (placingStamp.value === kind) {
    cancelPlacing();
    return;
  }
  placingStamp.value = kind;
  announce(`Click a page to place the ${tool.label.toLowerCase()}`, {
    quiet: true,
  });
};

const signLabel = commandLabel(CommandIdentifier.PDF_SIGN);
const sign = () =>
  editor.run(commandFor(CommandIdentifier.PDF_SIGN), {
    focus: !toolbarFocused.value,
  });

const onFocusIn = (event: FocusEvent) => {
  region.onFocusin();
  follow(event.target);
};
const onKey = (event: KeyboardEvent) => {
  if (onKeydown(event)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (!cancelPlacing()) pages()?.focus();
  }
};
</script>

<template>
  <div
    id="signing-toolbar"
    ref="root"
    class="top-row"
    role="toolbar"
    aria-label="Signing"
    @keydown="onKey"
    @focusin="onFocusIn"
    @focusout="region.onFocusout"
  >
    <button
      v-for="(tool, index) in state.tools"
      :key="tool.kind"
      type="button"
      class="signing-tool"
      :data-tool="tool.kind"
      :aria-pressed="tool.placing"
      :aria-disabled="tool.refusal ? true : undefined"
      :tabindex="tabindexOf(index)"
      v-bind="tipAttrs({ name: tool.refusal ?? tool.label })"
      @click="use(tool, $event)"
    >
      <IconGlyph :name="tool.icon" />
      <span>{{ tool.label }}</span>
    </button>
    <span class="separator" role="separator" aria-orientation="vertical" />
    <button
      type="button"
      class="signing-sign"
      :aria-disabled="state.signRefusal ? true : undefined"
      :tabindex="tabindexOf(state.tools.length)"
      v-bind="
        tipAttrs({
          name: signTip(state.signRefusal),
          command: CommandIdentifier.PDF_SIGN,
          key: signKey(),
        })
      "
      @click="sign"
    >
      {{ signLabel }}
    </button>
    <!-- the found places' Next · n of m, which comes with them -->
    <button type="button" class="signing-next" hidden tabindex="-1">
      Next
    </button>
    <p v-if="state.note" class="signing-note" role="status">
      {{ state.note }}
    </p>
  </div>
</template>
