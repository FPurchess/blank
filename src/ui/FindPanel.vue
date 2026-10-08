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
import { commandKey } from "../editor/keyBindings";
import { useEditor } from "../editor/handle";
import {
  closeFind,
  replaceAllFound,
  replaceFound,
  setFind,
  stepFind,
} from "../editor/plugins/find/commands";
import { findKey } from "../editor/plugins/find/state";
import { place } from "../popup";
import { listenOnWindow } from "../scope";
import {
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
  panelAnchor,
} from "./findPanelModel";

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

const run = (command: Parameters<typeof editor.run>[0]) =>
  editor.run(command, { focus: false });

// what's typed is looked for at once
watch(query, (value) => {
  if (value !== found.value?.query) run(setFind({ query: value }));
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
    void nextTick(() => field.value?.focus(true));
  },
  { immediate: true },
);
watch(tabSwitch, () => {
  run(setFind({ options: findOptions.value }));
  query.value = found.value?.query ?? "";
});

const step = (direction: 1 | -1) => run(stepFind(direction));
const close = () => editor.run(closeFind(true));

const findKeyAgain = commandKey(CommandIdentifier.EDIT_FIND, () => {
  field.value?.focus(true);
  return true;
});
const onKeydown = (event: KeyboardEvent) => {
  if (findKeyAgain({} as never, event)) {
    event.preventDefault();
  } else if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
};
const onFindKey = (event: KeyboardEvent) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  step(event.shiftKey ? -1 : 1);
};
// F3 anywhere while the panel is open
listenOnWindow("keydown", (event) => {
  if (event.key !== "F3" || event.ctrlKey || event.altKey || event.metaKey)
    return;
  event.preventDefault();
  step(event.shiftKey ? -1 : 1);
});

// at the top right of the pages, again when the page view moves, not when
// it scrolls
const viewPlace = computed(() => {
  const box = viewBox();
  return box ? `${box.top},${box.right}` : "";
});
const placePanel = () => {
  const [top, right] = viewPlace.value.split(",").map(Number);
  place(
    root.value!,
    panelAnchor(
      viewPlace.value ? { top, right } : null,
      window.innerWidth,
      TOP_BAR_HEIGHT,
    ),
    { align: "end" },
  );
};
onMounted(placePanel);
onUpdated(placePanel);
watch(viewPlace, placePanel);
listenOnWindow("resize", placePanel);

const { onFocusin, onFocusout } = useFocusRegion(
  () => root.value,
  findFocused,
  {
    id: "find",
    order: FOCUS_ORDER.find,
    focus: () => field.value?.focus(true),
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
      class="find-field"
      aria-label="Find"
      placeholder="Find"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? 'find-error' : undefined"
      @keydown="onFindKey"
    >
      <span class="count" aria-live="polite">{{ count }}</span>
    </SearchField>
    <p v-if="error" id="find-error" class="find-error">{{ error }}</p>
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
    />
    <div class="find-actions">
      <IconButton
        icon="chevron-left"
        label="Previous match"
        tip-key="Shift+Enter"
        @click="step(-1)"
      />
      <IconButton
        icon="chevron-right"
        label="Next match"
        tip-key="Enter"
        @click="step(1)"
      />
      <span class="find-spacer" />
      <button
        type="button"
        class="find-button"
        @click="run(replaceFound(replacement))"
      >
        Replace
      </button>
      <button
        type="button"
        class="find-button"
        @click="run(replaceAllFound(replacement))"
      >
        Replace all
      </button>
    </div>
  </div>
</template>
