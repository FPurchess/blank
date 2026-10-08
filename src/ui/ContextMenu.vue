<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  onUpdated,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { CommandIdentifier } from "../config";
import { commandShortcut, onCommandKey } from "../editor/keyBindings";
import { place } from "../popup";
import { listenOnWindow } from "../scope";
import {
  announce,
  type ContextMenuRequest,
  language,
  spellcheck,
} from "../state";
import SearchField from "./components/SearchField.vue";
import { useDismiss } from "./composables/useDismiss";
import { useMenuLevels } from "./composables/useMenuLevels";
import { useResizeObserver } from "./composables/useResizeObserver";
import MenuList from "./MenuList.vue";
import { firstEnabled, foundText, lastEnabled, optionId } from "./menuModel";

// A menu: the context menu, which replaces the webview's (see
// src/editor/plugins/contextMenu.ts for when it opens and
// src/editor/contextMenu/model.ts for its items), a button's menu, or the
// main menu with its search (src/ui/LogoButton.vue). It holds the focus
// while it's open; what the keys do is in useMenuLevels. App.vue keys it by
// the request's `close`, so a request of the open menu updates it here and
// another one mounts a new menu.
const props = defineProps<{ request: ContextMenuRequest }>();

// opening the menu of the next misspelling scrolls to it, which mustn't close
// the menu right away
const SCROLL_GRACE = 500;
// how long typing rests before the number of commands found is read out
const ANNOUNCE_AFTER = 500;
const openedAt = Date.now();

const container = useTemplateRef<HTMLElement>("container");
const box = useTemplateRef<HTMLElement>("box");
const scroller = useTemplateRef<HTMLElement>("scroller");
const lists = useTemplateRef<InstanceType<typeof MenuList>[]>("lists");
// the main menu's own list, inside its box below the search
const mainList = useTemplateRef<InstanceType<typeof MenuList>>("mainList");
const field = useTemplateRef<InstanceType<typeof SearchField>>("field");

// the main menu's search: what it found shows in place of the menu
const query = shallowRef("");
const search = computed(() => props.request.search);
const searching = computed(() => !!search.value && query.value.trim() !== "");

const menu = useMenuLevels(
  () => props.request,
  () => [...(mainList.value ? [mainList.value] : []), ...(lists.value ?? [])],
  search.value
    ? {
        levelZero: () =>
          searching.value
            ? search.value!.results(query.value)
            : props.request.items,
        searching: () => searching.value,
        focusSearch: () => field.value?.focus(),
        onPrintable: (key) => {
          query.value += key;
          field.value?.focus("end");
        },
      }
    : {},
);
const { levels, editing, close } = menu;

// what the search found, read out once typing rests
let announcing: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  menu.showLevelZero(searching.value);
  clearTimeout(announcing);
  if (!searching.value) return;
  announcing = setTimeout(
    () =>
      announce(
        levels.value[0].items.length
          ? foundText(levels.value[0].items.length)
          : search.value!.empty(query.value),
        { quiet: true },
      ),
    ANNOUNCE_AFTER,
  );
});
onUnmounted(() => clearTimeout(announcing));

// the line the search's arrows are on, which the search says is active
const active = computed(() => {
  if (!searching.value) return undefined;
  const index = levels.value[0].index;
  return index >= 0 ? optionId(0, index) : undefined;
});
watch(
  () => levels.value[0].index,
  (index) => {
    if (searching.value) mainList.value?.reveal(index);
  },
  { flush: "post" },
);

// the main menu's keys in its search: the arrows move through what it found,
// or into the menu, Enter runs what is active, Esc clears the search first
const onSearchKey = (event: KeyboardEvent) => {
  const { key } = event;
  const handled = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  const { index } = levels.value[0];
  if (key === "ArrowDown" || key === "ArrowUp") {
    handled();
    const items = levels.value[0].items;
    if (searching.value) menu.moveBy(0, key === "ArrowDown" ? 1 : -1);
    // into the menu, at its top or, going up, at its bottom
    else
      menu.focusItem(
        0,
        key === "ArrowDown" ? firstEnabled(items) : lastEnabled(items),
      );
  } else if (key === "Enter") {
    handled();
    if (searching.value && index >= 0) menu.activate(0, index);
  } else if (key === "Escape") {
    handled();
    if (query.value) query.value = "";
    else close();
  } else if (key === "Tab") {
    handled();
    close();
  }
};

// the main menu's key again, while it's open: back to its search, from a
// submenu too, its text selected to type over
const onMainKey = onCommandKey(CommandIdentifier.MENU_MAIN, () => {
  menu.backToSearch();
  field.value?.focus("all");
});
const searchShortcut = computed(() =>
  commandShortcut(CommandIdentifier.MENU_MAIN),
);

// the main menu at most as tall as the window allows below its anchor, its list
// fading out at the bottom while there's more of it below
const more = shallowRef(false);
const fade = () => {
  const element = scroller.value;
  more.value =
    !!element &&
    element.scrollTop + element.clientHeight < element.scrollHeight - 2;
};
// placed once: its height is at most what the window allows, whatever it lists, and a
// resize closes it
onMounted(() => {
  if (box.value) place(box.value, props.request.anchor, { fill: true });
});
onMounted(fade);
onUpdated(fade);
useResizeObserver(() => [scroller.value], fade);

onMounted(menu.focusCurrent);

// what closes the menu while it's open: a press or a scroll outside it and
// the button that opened it, whose own click closes it, but for the scroll
// the menu's own opening caused
const { contains } = useDismiss(
  () => [container.value, props.request.owner],
  close,
  { resize: true, blur: true },
);
listenOnWindow(
  "scroll",
  (event) => {
    if (Date.now() - openedAt > SCROLL_GRACE && !contains(event.target)) {
      close();
    }
  },
  true,
);
watch([spellcheck, language], close);
</script>

<template>
  <!-- the main menu's key takes the focus back to its search, also from a
  submenu -->
  <div
    ref="container"
    class="context-menus"
    @keydown.capture="search && onMainKey($event)"
  >
    <div
      v-if="search"
      id="main-menu"
      ref="box"
      class="main-menu"
      role="dialog"
      aria-label="Main menu"
    >
      <SearchField
        ref="field"
        v-model="query"
        class="menu-search"
        role="combobox"
        aria-label="Search commands"
        aria-autocomplete="list"
        aria-controls="context-menu"
        :aria-expanded="searching"
        :aria-activedescendant="active"
        placeholder="Search commands"
        @keydown="onSearchKey"
      >
        <kbd v-if="searchShortcut">{{ searchShortcut }}</kbd>
      </SearchField>
      <div
        ref="scroller"
        class="main-menu-list"
        :class="{ more }"
        @scroll="fade"
      >
        <MenuList
          ref="mainList"
          :items="levels[0].items"
          :depth="0"
          :anchor="request.anchor"
          :side="null"
          :focused="levels[0].index"
          :column="levels[0].column"
          :expanded="levels[1] ? levels[0].index : -1"
          :editing="editing?.depth === 0 ? editing.index : -1"
          embedded
          :found="searching"
          @hover="(index, column) => menu.hover(0, index, column)"
          @activate="(index, column) => menu.activate(0, index, column)"
          @key="menu.onKey(0, $event)"
          @edit-submit="menu.submitEdit(0, $event)"
          @edit-cancel="menu.cancelEdit"
          @close="close"
        />
        <p v-if="searching && levels[0].items.length === 0" class="menu-foot">
          {{ search.empty(query) }}
        </p>
      </div>
    </div>
    <template v-for="(level, depth) in levels" :key="depth">
      <MenuList
        v-if="!search || depth > 0"
        ref="lists"
        :items="level.items"
        :depth="depth"
        :anchor="request.anchor"
        :side="level.side"
        :focused="level.index"
        :column="level.column"
        :expanded="levels[depth + 1] ? level.index : -1"
        :editing="editing?.depth === depth ? editing.index : -1"
        @hover="(index, column) => menu.hover(depth, index, column)"
        @activate="(index, column) => menu.activate(depth, index, column)"
        @key="menu.onKey(depth, $event)"
        @edit-submit="menu.submitEdit(depth, $event)"
        @edit-cancel="menu.cancelEdit"
        @close="close"
      />
    </template>
  </div>
</template>
