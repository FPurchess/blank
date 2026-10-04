<script setup lang="ts">
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { CommandIdentifier } from "../config";
import { commandLabel } from "../commandList";
import {
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  newFile,
  saveFile,
  selectTab,
} from "../editor/commands";
import {
  hideBlocksPane,
  toggleBlocksPane,
} from "../editor/commands/contentBlocks";
import { useEditor } from "../editor/handle";
import { moveTab } from "../editor/tabs";
import {
  activeTabId,
  blocksPaneOpen,
  registerFocusStop,
  tabRowFocused,
  tabs,
} from "../state";
import BlankLogo from "./BlankLogo.vue";
import IconButton from "./components/IconButton.vue";
import { useMenuButton } from "./composables/useMenuButton";
import { useWindowCommands } from "./composables/useWindowCommands";
import DocumentTab from "./DocumentTab.vue";
import { wheelPixels } from "./outlineModel";
import { DRAG_START } from "../editor/pageMove";
import {
  compactBlocks,
  dragBy,
  middleCloses,
  scrollLeftFor,
  tabKey,
  tabMenu,
} from "./tabRowModel";

// The tab row, the top row of the window: the logo, a tab for each open
// document, + for a new one, and the Blocks button. The tabs are a tab list
// with one tab in the tab order: ←→ Home End move the focus, Enter shows the
// tab, Delete closes it, Esc and F6 go back to the text. What the keys and
// the pointer do is in tabRowModel.ts, what the tabs do in src/editor/tabs.ts.
const editor = useEditor();
const list = useTemplateRef<HTMLElement>("list");
const spare = useTemplateRef<HTMLElement>("spare");
const C = CommandIdentifier;

// the keys of the window work from the tab row, and everywhere else
useWindowCommands();

// the tab that is in the tab order, the active one unless the arrows moved on
const focused = shallowRef<string | null>(null);
const stop = () => focused.value ?? activeTabId.value;

const tabElements = () => [
  ...(list.value?.querySelectorAll<HTMLElement>("[role=tab]") ?? []),
];
const tabIdOf = (target: EventTarget | null) =>
  (target as Element | null)
    ?.closest<HTMLElement>("[data-tab-id]")
    ?.getAttribute("data-tab-id") ?? null;
const indexOf = (id: string | null) =>
  tabs.value.findIndex((tab) => tab.id === id);

const focusTab = (id: string | null) => {
  focused.value = id;
  void nextTick(() =>
    tabElements()
      .find((element) => element.dataset.tabId === id)
      ?.focus(),
  );
};

// F6 comes to the tab row after the text
onUnmounted(
  registerFocusStop({
    id: "tabs",
    order: 10,
    focus: () => focusTab(activeTabId.value),
    has: (element) => !!element && !!list.value?.contains(element),
  }),
);

const run = (command: Parameters<typeof editor.run>[0], focus = true) =>
  editor.run(command, { focus });

// the menu of a tab, at the pointer or below the tab
const menu = useMenuButton(() => {
  if (!list.value?.contains(document.activeElement)) editor.focus();
});
const openMenu = (id: string, element: HTMLElement, at?: MouseEvent) => {
  const tab = tabs.value.find((candidate) => candidate.id === id);
  if (!tab) return;
  const items = tabMenu(tab, indexOf(id), tabs.value.length, {
    close: (tabId) => run(closeTab(tabId)),
    closeOthers: (tabId) => run(closeOtherTabs(tabId)),
    closeRight: (tabId) => run(closeTabsToRight(tabId)),
    save: (tabId, force) => run(saveFile({ force }, tabId)),
    copyPath: (path) => void writeText(path).catch(console.error),
  });
  const box = element.getBoundingClientRect();
  menu.openAt(element, items, {
    anchor: at
      ? { left: at.clientX, top: at.clientY, bottom: at.clientY }
      : { left: box.left, top: box.top, bottom: box.bottom },
    keyboard: !at,
  });
};

const onKeydown = (event: KeyboardEvent) => {
  const id = tabIdOf(event.target);
  if (id === null) return;
  const action = tabKey(
    event.key,
    event.shiftKey,
    indexOf(id),
    tabs.value.length,
  );
  if (action === null) return;
  event.preventDefault();
  if (typeof action === "object") {
    focusTab(tabs.value[action.move].id);
  } else if (action === "activate") {
    run(selectTab(id), false);
  } else if (action === "close") {
    run(closeTab(id), false);
  } else if (action === "menu") {
    openMenu(id, event.target as HTMLElement);
  } else {
    editor.focus();
  }
};

// a middle click closes the tab it was pressed and let go on
let middlePressed: string | null = null;
// a drag of a tab moves it along the row
let drag: { id: string; x: number; moving: boolean } | null = null;

const onPointerdown = (event: PointerEvent) => {
  const id = tabIdOf(event.target);
  if (event.button === 1) middlePressed = id;
  if (event.button !== 0 || id === null) return;
  if ((event.target as Element).closest(".tab-close")) return;
  drag = { id, x: event.clientX, moving: false };
};

const onPointermove = (event: PointerEvent) => {
  if (!drag) return;
  if (!(event.buttons & 1)) return void (drag = null);
  if (!drag.moving && Math.abs(event.clientX - drag.x) < DRAG_START) return;
  if (!drag.moving) {
    // the drag follows the pointer off the row too, once it's a drag: a
    // capture before would take the click from the tab
    list.value?.setPointerCapture?.(event.pointerId);
    drag.moving = true;
  }
  const boxes = tabElements().map((element) => element.getBoundingClientRect());
  const edges = [
    ...boxes.map((box) => box.left),
    boxes[boxes.length - 1]?.right ?? 0,
  ];
  const by = dragBy(edges, indexOf(drag.id), event.clientX);
  if (by !== 0) moveTab(drag.id, by);
};

// whether the click that follows a drag does nothing
let dragged = false;
const onPointerup = () => {
  dragged = drag?.moving ?? false;
  drag = null;
};

const onMouseup = (event: MouseEvent) => {
  if (event.button !== 1) return;
  const id = tabIdOf(event.target);
  if (middleCloses(middlePressed, id)) run(closeTab(id!), false);
  middlePressed = null;
};

const onClick = (event: MouseEvent) => {
  if (dragged) return void (dragged = false);
  const id = tabIdOf(event.target);
  if (id === null) return;
  if ((event.target as Element).closest(".tab-close")) run(closeTab(id));
  else run(selectTab(id));
};

const onContextmenu = (event: MouseEvent) => {
  const id = tabIdOf(event.target);
  if (id === null) return;
  event.preventDefault();
  const element = (event.target as Element).closest<HTMLElement>("[role=tab]");
  if (element) openMenu(id, element, event);
};

// a double click on the row's empty part opens a new tab
const onDblclick = (event: MouseEvent) => {
  const target = event.target as Element;
  if (target === list.value || target === spare.value) run(newFile());
};

// the wheel scrolls the tabs that don't fit
const onWheel = (event: WheelEvent) => {
  const element = list.value;
  if (!element || element.scrollWidth <= element.clientWidth) return;
  const before = element.scrollLeft;
  element.scrollLeft += wheelPixels(
    { deltaY: event.deltaY || event.deltaX, deltaMode: event.deltaMode },
    element.clientWidth,
  );
  if (element.scrollLeft !== before) event.preventDefault();
};

// the tab shown is always scrolled into view
watch(
  activeTabId,
  (id) => {
    focused.value = null;
    const element = list.value;
    const tab = tabElements().find(
      (candidate) => candidate.dataset.tabId === id,
    );
    if (!element || !tab) return;
    const left = scrollLeftFor(
      tab.offsetLeft,
      tab.offsetWidth,
      element.scrollLeft,
      element.clientWidth,
    );
    if (left !== null) element.scrollLeft = left;
  },
  { flush: "post" },
);

const onFocusin = () => (tabRowFocused.value = true);
const onFocusout = (event: FocusEvent) => {
  if (list.value?.contains(event.relatedTarget as Node | null)) return;
  tabRowFocused.value = false;
  focused.value = null;
};
onUnmounted(() => (tabRowFocused.value = false));

// the Blocks button: the pane opens with the focus in its search, and goes
const toggleBlocks = () => {
  if (blocksPaneOpen.value) hideBlocksPane(editor.view);
  else run(toggleBlocksPane(), false);
};

// the Blocks button drops its name once the tabs need the room
const compact = shallowRef(false);
const fit = () => {
  const element = list.value;
  if (!element) return;
  compact.value = compactBlocks(
    compact.value,
    element.scrollWidth > element.clientWidth + 1,
    spare.value?.clientWidth ?? 0,
  );
};
let resized: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === "undefined") return;
  resized = new ResizeObserver(fit);
  resized.observe(list.value!);
  resized.observe(spare.value!);
});
watch(() => tabs.value.length, fit, { flush: "post" });
onUnmounted(() => resized?.disconnect());
</script>

<template>
  <div id="tab-row" class="top-row tab-row">
    <BlankLogo />
    <div
      ref="list"
      class="tab-list"
      role="tablist"
      aria-label="Documents"
      @keydown="onKeydown"
      @pointerdown="onPointerdown"
      @pointermove="onPointermove"
      @pointerup="onPointerup"
      @pointercancel="onPointerup"
      @mouseup="onMouseup"
      @click="onClick"
      @contextmenu="onContextmenu"
      @wheel="onWheel"
      @dblclick="onDblclick"
      @focusin="onFocusin"
      @focusout="onFocusout"
    >
      <DocumentTab
        v-for="tab in tabs"
        :key="tab.id"
        :tab="tab"
        :selected="tab.id === activeTabId"
        :focusable="tab.id === stop()"
      />
    </div>
    <IconButton
      class="tab-row-new"
      icon="plus"
      :label="commandLabel(C.FILE_NEW)"
      :command="C.FILE_NEW"
      :focusable="false"
      @click="run(newFile())"
    />
    <div ref="spare" class="tab-row-spare" @dblclick="onDblclick" />
    <IconButton
      class="tab-row-blocks"
      :class="{ compact }"
      icon="blocks"
      label="Blocks"
      :tip="commandLabel(C.INSERT_BLOCK)"
      :command="C.INSERT_BLOCK"
      :pressed="blocksPaneOpen"
      :focusable="false"
      @click="toggleBlocks"
    >
      <span v-if="!compact" class="tab-row-label">Blocks</span>
    </IconButton>
  </div>
</template>
