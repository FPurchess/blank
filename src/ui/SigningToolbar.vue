<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";

import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import { focusBack } from "../dom";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { goNext } from "../pdf/placeActions";
import {
  shownBlocked,
  shownContext,
  shownNext,
  shownPlaces,
} from "../pdf/placesRead";
import { readShownRules } from "../pdf/sign";
import { cancelPlacing, placeStamp } from "../pdf/stampActions";
import type { StampKind } from "../pdf/stampModel";
import {
  announce,
  FOCUS_ORDER,
  placingStamp,
  shownPdf,
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
// Signature, Initials, Date and Place, then Sign… (`pdf.sign`) and Next
// (`pdf.next`), to the next place to fill in or sign. From the keyboard a tool places
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

const state = computed(() =>
  signingToolbar(shownContext(), placingStamp.value),
);

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

const use = (tool: SigningTool, event: MouseEvent) => {
  if (tool.refusal) {
    announce(tool.refusal);
    return;
  }
  const kind: StampKind = tool.kind;
  if (activatedByKeys(event)) {
    placingStamp.value = null;
    // the tool, after a dialog that made the signature first
    const back = focusBack(event.currentTarget);
    // the stamp placed takes the focus, so the arrows move it
    void placeStamp(kind, null, back);
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

// Next, with the places the PDF has to fill in; hidden without any, and on
// a PDF nothing can be filled in on
const next = shownNext;
const hasPlaces = computed(
  () => !shownBlocked.value && shownPlaces.value.length > 0,
);
const nextLabel = commandLabel(CommandIdentifier.PDF_NEXT);
const goToNext = () => {
  if (next.value.disabled) {
    announce(next.value.text);
    return;
  }
  void goNext();
};

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
    <button
      type="button"
      class="signing-next"
      :hidden="!hasPlaces"
      :aria-disabled="next.disabled ? true : undefined"
      :tabindex="hasPlaces ? tabindexOf(state.tools.length + 1) : -1"
      v-bind="
        tipAttrs({
          name: next.disabled ? next.text : nextLabel,
          command: CommandIdentifier.PDF_NEXT,
        })
      "
      @click="goToNext"
    >
      {{ next.text }}
    </button>
    <p v-if="state.note" class="signing-note" role="status">
      {{ state.note }}
    </p>
  </div>
</template>
