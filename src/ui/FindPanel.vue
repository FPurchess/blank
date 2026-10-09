<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUpdated,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { TOP_BAR_HEIGHT } from "../chrome";
import { CommandIdentifier } from "../config";
import { viewBox } from "../engine/geometry";
import { onCommandKey } from "../editor/keyBindings";
import { useEditor } from "../editor/handle";
import {
  closeFind,
  replaceAllFound,
  replaceFound,
  revealFound,
  setFind,
  stepFind,
} from "../editor/plugins/find/commands";
import { findKey } from "../editor/plugins/find/state";
import { place } from "../popup";
import { listenOnWindow } from "../scope";
import {
  contextMenu,
  focusTakingDialogs,
  FOCUS_ORDER,
  type FindOptions,
  findFocused,
  findOptions,
  findPanel,
  tabSwitch,
} from "../state";
import IconButton from "./components/IconButton.vue";
import SearchField from "./components/SearchField.vue";
import { useFocusRegion } from "./composables/useFocusRegion";
import {
  countText,
  errorText,
  FIND_TOGGLES,
  hasMatches,
  isStepKey,
  panelAnchor,
} from "./findPanelModel";
import { tipAttrs } from "./tooltipModel";

// Find and replace: a panel at the top right of the pages, which stays open
// while the text is edited (it isn't modal). Enter and Shift+Enter in its
// field, and F3 anywhere, go to the next and previous match; Esc closes it
// and selects the match in the text. What it found is the tab's, in its
// editor state (src/editor/plugins/find). See .claude/rules/find.md.
const editor = useEditor();
const root = useTemplateRef<HTMLElement>("root");
const field = useTemplateRef<InstanceType<typeof SearchField>>("field");

const found = computed(() => findKey.getState(editor.state.value));
const query = shallowRef(found.value?.query ?? "");
const replacement = shallowRef("");
const count = computed(() => countText(found.value));
const error = computed(() => errorText(found.value));
// the arrows and Replace are off without a match, focusable still
const noMatch = computed(() => !hasMatches(found.value));

const run = (command: Parameters<typeof editor.run>[0]) =>
  editor.run(command, { focus: false });

// what's typed is looked for at once, and the match it's at shown
watch(query, (value) => {
  if (value === found.value?.query) return;
  run(setFind({ query: value }));
  run(revealFound);
});
const toggle = (option: keyof FindOptions) => {
  findOptions.value = {
    ...findOptions.value,
    [option]: !findOptions.value[option],
  };
  run(setFind({ options: findOptions.value }));
};

// Ctrl+F (again) puts the focus in the field, its text selected; another tab
// shows what it looks for, with the panel's options
watch(
  findPanel,
  (request) => {
    if (!request) return;
    query.value = found.value?.query ?? query.value;
    void nextTick(() => field.value?.focus("all"));
  },
  { immediate: true },
);
watch(tabSwitch, () => {
  // a tab that never looked for anything looks for what the panel shows
  run(
    setFind({
      options: findOptions.value,
      query: found.value?.query || query.value,
    }),
  );
  query.value = found.value?.query ?? "";
});

const step = (direction: 1 | -1) => run(stepFind(direction));
// a dialog or a menu keeps its keys, F3 too
const ownKeysOpen = () =>
  focusTakingDialogs.some((request) => request.value !== null) ||
  contextMenu.value !== null;
const close = () => editor.run(closeFind(true));
const doneTip = tipAttrs({ name: "Close", key: "Esc" });

const findKeyAgain = onCommandKey(CommandIdentifier.EDIT_FIND, () =>
  field.value?.focus("all"),
);
const onKeydown = (event: KeyboardEvent) => {
  if (findKeyAgain(event)) return;
  // the Esc that cancels a composition, e.g. of Japanese, is the IME's
  if (event.key === "Escape" && !event.isComposing) {
    event.preventDefault();
    close();
  }
};
const onFindKey = (event: KeyboardEvent) => {
  // the Enter that confirms a composition is the IME's
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  step(event.shiftKey ? -1 : 1);
};
const replaceOne = () => run(replaceFound(replacement.value));
const onReplaceKey = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  replaceOne();
};
// F3 anywhere while the panel is open, but in what holds its own keys
listenOnWindow("keydown", (event) => {
  if (!isStepKey(event) || ownKeysOpen()) return;
  if (step(event.shiftKey ? -1 : 1)) event.preventDefault();
});

// at the top right of the pages, again when the page view moves, not when
// it scrolls
const viewTop = computed(() => viewBox()?.top ?? null);
const viewRight = computed(() => viewBox()?.right ?? null);
const placePanel = () =>
  place(
    root.value!,
    panelAnchor(
      viewTop.value === null || viewRight.value === null
        ? null
        : { top: viewTop.value, right: viewRight.value },
      window.innerWidth,
      TOP_BAR_HEIGHT,
    ),
    { align: "end" },
  );
onMounted(placePanel);
onUpdated(placePanel);
watch([viewTop, viewRight], placePanel);
listenOnWindow("resize", placePanel);

const { onFocusin, onFocusout } = useFocusRegion(
  () => root.value,
  findFocused,
  {
    id: "find",
    order: FOCUS_ORDER.find,
    focus: () => field.value?.focus("all"),
  },
);
</script>

<template>
  <div
    id="find-panel"
    ref="root"
    class="find-panel"
    role="search"
    aria-label="Find and replace"
    @keydown="onKeydown"
    @focusin="onFocusin"
    @focusout="onFocusout"
  >
    <SearchField
      ref="field"
      v-model="query"
      aria-label="Find"
      placeholder="Find"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? 'find-error' : undefined"
      @keydown="onFindKey"
    >
      <span class="count" aria-live="polite">{{ count }}</span>
    </SearchField>
    <p id="find-error" class="find-error" aria-live="polite">{{ error }}</p>
    <div class="find-toggles">
      <IconButton
        v-for="toggleOf in FIND_TOGGLES"
        :key="toggleOf.option"
        :label="toggleOf.label"
        :pressed="findOptions[toggleOf.option]"
        @click="toggle(toggleOf.option)"
        >{{ toggleOf.text }}</IconButton
      >
    </div>
    <SearchField
      v-model="replacement"
      icon="replace"
      aria-label="Replace with"
      placeholder="Replace with"
      @keydown="onReplaceKey"
    />
    <div class="find-actions">
      <IconButton
        icon="chevron-left"
        label="Previous match"
        tip-key="Shift+Enter"
        :disabled="noMatch"
        @click="step(-1)"
      />
      <IconButton
        icon="chevron-right"
        label="Next match"
        tip-key="Enter"
        :disabled="noMatch"
        @click="step(1)"
      />
      <button
        type="button"
        class="find-button"
        :aria-disabled="noMatch || undefined"
        @click="replaceOne"
      >
        Replace
      </button>
      <button
        type="button"
        class="find-button"
        :aria-disabled="noMatch || undefined"
        @click="run(replaceAllFound(replacement))"
      >
        Replace all
      </button>
      <!-- closes as Esc does, the match it's at selected in the text -->
      <button type="button" class="find-done" v-bind="doneTip" @click="close">
        Done
      </button>
    </div>
  </div>
</template>
