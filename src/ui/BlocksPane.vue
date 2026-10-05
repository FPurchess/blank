<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { CommandIdentifier } from "../config";
import {
  hideBlocksPane,
  insertBlock,
  refreshBlocks,
} from "../editor/commands/contentBlocks";
import { useEditor } from "../editor/handle";
import { commandKey } from "../editor/keyBindings";
import { listenOnWindow } from "../scope";
import {
  blockChoices,
  blocksPaneFocused,
  blocksPaneOpen,
  blocksPaneSearch,
  OUTLINE_BREAKPOINT,
} from "../state";
import BlockTile from "./BlockTile.vue";
import { groupsOf, tileStep } from "./blocksPaneModel";
import IconGlyph from "./components/IconGlyph.vue";
import SidePaneHead from "./components/SidePaneHead.vue";
import { useBodyClass } from "./composables/useBodyClass";
import { useDismiss } from "./composables/useDismiss";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useWindowWidth } from "./composables/useWindowWidth";
import { tileDrag } from "./tileDrag";

// The blocks pane at the left of the pages: the content blocks Blank can
// insert, as tiles in groups, with a search. A click inserts a block where
// the cursor is, and dragging a tile onto the pages inserts it between two
// blocks there. It docks from OUTLINE_BREAKPOINT on, the pages making room,
// and floats over them below. It takes the focus: ↓ goes from the search to
// the tiles, the arrows move between them, Enter inserts, Esc goes back to
// the text and leaves the pane open; Mod-Alt-B or "Hide pane" closes it.
const editor = useEditor();

const root = useTemplateRef<HTMLElement>("root");
const search = useTemplateRef<HTMLInputElement>("search");
const query = shallowRef("");

const groups = computed(() => groupsOf(blockChoices.value, query.value));
const tiles = computed(() => groups.value.flatMap(({ choices }) => choices));
const sizes = computed(() => groups.value.map(({ choices }) => choices.length));
// the tile in the tab order, by its id; the first one shown while it isn't
const chosen = shallowRef<string | null>(null);
const currentId = computed(() =>
  tiles.value.some(({ id }) => id === chosen.value)
    ? chosen.value
    : tiles.value[0]?.id,
);
// a new search starts again at its first tile
watch(query, () => (chosen.value = null));

const windowWidth = useWindowWidth();
const docked = computed(() => windowWidth.value >= OUTLINE_BREAKPOINT);
useBodyClass("blocks-docked", () => docked.value);
// floating over the pages, a press elsewhere puts it away, as the outline's
// floating list goes
useDismiss(
  () => [root.value],
  () => {
    if (!docked.value) blocksPaneOpen.value = false;
  },
);

onMounted(() => {
  if (blockChoices.value.length === 0)
    editor.run(refreshBlocks(), { focus: false });
});

// the search takes the focus when the shortcut opens the pane
watch(
  blocksPaneSearch,
  (request) => {
    if (!request) return;
    void nextTick(() => {
      search.value?.focus();
      search.value?.select();
    });
  },
  { immediate: true },
);

const { onFocusin: onFocusIn, onFocusout: onFocusOut } = useFocusRegion(
  () => root.value,
  blocksPaneFocused,
);
// going while it has the focus, the pane leaves it to the text, not to the
// body, where typing would go nowhere
onBeforeUnmount(() => {
  if (root.value?.contains(document.activeElement)) editor.focus();
});

const tileButtons = () => [
  ...(root.value?.querySelectorAll<HTMLElement>(".tile") ?? []),
];

const focusTile = (index: number) => {
  chosen.value = tiles.value[index]?.id ?? null;
  tileButtons()[index]?.focus();
};

const insert = (id: string, gap?: number) => {
  const choice = tiles.value.find((tile) => tile.id === id);
  if (!choice || choice.disabled) return;
  editor.run(insertBlock(id, gap));
};

// the shortcut that opened the pane closes it while it has the focus
const closeKey = commandKey(CommandIdentifier.INSERT_BLOCK, () => {
  hideBlocksPane(editor.view);
  return true;
});

const onKeyDown = (event: KeyboardEvent) => {
  if (closeKey(editor.view, event)) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    drag.cancel();
    editor.focus();
  }
};

const onSearchKey = (event: KeyboardEvent) => {
  if (event.key === "ArrowDown" && tiles.value.length > 0) {
    event.preventDefault();
    focusTile(
      Math.max(
        0,
        tiles.value.findIndex(({ id }) => id === currentId.value),
      ),
    );
  } else if (event.key === "Enter") {
    event.preventDefault();
    const first = tiles.value.find((tile) => !tile.disabled);
    if (first) insert(first.id);
  }
};

const tileOf = (event: Event) =>
  (event.target as Element).closest<HTMLElement>(".tile");

const onTileKey = (event: KeyboardEvent) => {
  const tile = tileOf(event);
  if (!tile) return;
  const index = tileButtons().indexOf(tile);
  const next = tileStep(event.key, index, sizes.value);
  if (next === null) return;
  event.preventDefault();
  if (next < 0) search.value?.focus();
  else focusTile(next);
};

// a drag of a tile onto the pages, see ./tileDrag.ts
const drag = tileDrag({
  doc: () => editor.state.value.doc,
  onPages: (x, y) =>
    !!document.elementFromPoint(x, y)?.closest("#page-view, #editor"),
  drop: (id, gap) => insert(id, gap),
});
listenOnWindow("keydown", (event) => {
  if (event.key === "Escape" && drag.dragging) drag.cancel();
});
// the click that ends a drag inserts nothing more: it comes right after
// the release, if it comes at all, so the flag lasts until the next task
let dragged = false;

const onPointerDown = (event: PointerEvent) => {
  dragged = false;
  const tile = tileOf(event);
  if (tile && tile.getAttribute("aria-disabled") !== "true")
    drag.down(event, tile.dataset.block!);
};
const onPointerUp = (event: PointerEvent) => {
  dragged = drag.up(event);
  if (dragged) setTimeout(() => (dragged = false));
};
const onClick = (event: MouseEvent) => {
  const tile = tileOf(event);
  if (dragged) {
    dragged = false;
    return;
  }
  if (!tile) return;
  chosen.value = tile.dataset.block!;
  insert(tile.dataset.block!);
};

// presses keep the focus where it is, in the text or the search, except in
// the search
const onMouseDown = (event: MouseEvent) => {
  if (!(event.target as Element).closest("input")) event.preventDefault();
};
</script>

<template>
  <section
    id="blocks-pane"
    ref="root"
    :class="{ docked, floating: !docked }"
    aria-labelledby="blocks-pane-title"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeyDown"
    @mousedown="onMouseDown"
  >
    <SidePaneHead
      title="Blocks"
      title-id="blocks-pane-title"
      hide-icon="chevron-left"
      hide-label="Hide pane"
      :command="CommandIdentifier.INSERT_BLOCK"
      @hide="hideBlocksPane(editor.view)"
    />
    <label class="blocks-search">
      <IconGlyph name="search" />
      <input
        ref="search"
        v-model="query"
        type="search"
        placeholder="Search blocks"
        aria-label="Search blocks"
        autocomplete="off"
        :spellcheck="false"
        @keydown="onSearchKey"
      />
    </label>
    <div
      class="blocks-groups"
      @keydown="onTileKey"
      @pointerdown="onPointerDown"
      @pointermove="drag.move"
      @pointerup="onPointerUp"
      @pointercancel="drag.cancel"
      @click="onClick"
    >
      <template v-for="group in groups" :key="group.group">
        <h3 :id="`blocks-group-${group.group}`" class="blocks-group">
          {{ group.label }}
        </h3>
        <div
          class="tiles"
          role="group"
          :aria-labelledby="`blocks-group-${group.group}`"
        >
          <BlockTile
            v-for="choice in group.choices"
            :key="choice.id"
            :choice="choice"
            :current="choice.id === currentId"
          />
        </div>
      </template>
      <p v-if="groups.length === 0" class="blocks-none">
        No block matches “{{ query.trim() }}”
      </p>
    </div>
    <footer class="side-pane-foot">
      Click to insert at the cursor, or drag between paragraphs.
    </footer>
  </section>
</template>
