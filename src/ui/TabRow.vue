<script setup lang="ts">
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { nextTick, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

import { CommandIdentifier } from "../config";
import { commandLabel } from "../commandList";
import {
  closeOtherTabs,
  closeTabsToRight,
  print,
  saveFile,
  selectTab,
} from "../editor/commands";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import { activateTab, closeTabs, moveTab } from "../editor/tabs";
import { engineless } from "../engine/engine";
import { logError } from "../log";
import {
  activeTabId,
  blocksPaneOpen,
  FOCUS_ORDER,
  tabRowFocused,
  tabs,
} from "../state";
import LogoButton from "./LogoButton.vue";
import IconButton from "./components/IconButton.vue";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useMenuButton } from "./composables/useMenuButton";
import { useResizeObserver } from "./composables/useResizeObserver";
import DocumentTab from "./DocumentTab.vue";
import { wheelPixels } from "./scrollModel";
import { tabDrag } from "./tabDrag";
import {
  compactBlocks,
  logoKey,
  middleCloses,
  scrollLeftFor,
  tabKey,
  tabMenu,
} from "./tabRowModel";

// The tab row, the top row of the window: the logo, a tab for each open
// document, + for a new one, and the Blocks button. The tabs are a tab list
// with one tab in the tab order: ←→ Home End move the focus, Enter shows the
// tab, Delete closes it, Esc and F6 go back to the text. What the keys and
// the menu do is in tabRowModel.ts, dragging in tabDrag.ts, what the tabs do
// in src/editor/tabs.ts.
const editor = useEditor();
const list = useTemplateRef<HTMLElement>("list");
const spare = useTemplateRef<HTMLElement>("spare");
const label = useTemplateRef<HTMLElement>("label");
const C = CommandIdentifier;
const newLabel = commandLabel(C.FILE_NEW);
const blocksTip = commandLabel(C.INSERT_BLOCK);

const tabElements = () => [
  ...(list.value?.querySelectorAll<HTMLElement>("[role=tab]") ?? []),
];
const elementOf = (id: string | null) =>
  tabElements().find((element) => element.dataset.tabId === id);
const tabIdOf = (target: EventTarget | null) =>
  (target as Element | null)
    ?.closest<HTMLElement>("[data-tab-id]")
    ?.getAttribute("data-tab-id") ?? null;
const indexOf = (id: string | null) =>
  tabs.value.findIndex((tab) => tab.id === id);
const onClose = (target: EventTarget | null) =>
  !!(target as Element | null)?.closest(".tab-close");

const run = (command: Parameters<typeof editor.run>[0], focus = true) =>
  editor.run(command, { focus });

// what is in the tab order: the shown tab, unless the arrows moved the
// focus on, to another tab or to the logo (LOGO)
const LOGO = "logo";
const focused = shallowRef<string | null>(null);
const stop = () => focused.value ?? activeTabId.value;
const logo = useTemplateRef<InstanceType<typeof LogoButton>>("logo");
const focusLogo = () => {
  focused.value = LOGO;
  logo.value?.focus();
};

/**
 * focusTab gives the tab `id` the focus, once it's rendered
 */
const focusTab = (id: string | null) => {
  focused.value = id;
  void nextTick(() => elementOf(id)?.focus());
};

/**
 * close closes the tab `id`. Closed from the keyboard, the focus goes to the
 * tab shown then, rather than away with the tab.
 */
const close = (id: string, fromKeys = false) => {
  const closing = closeTabs([id]);
  if (!fromKeys) return editor.focus();
  void closing.then(() => {
    if (!list.value?.contains(document.activeElement)) {
      focusTab(activeTabId.value);
    }
  });
};

// the menu of a tab, at the pointer or below the tab: one opened from the
// keyboard gives its tab the focus back, one opened by a click the text
const menu = useMenuButton((keyboard) => {
  if (keyboard) focusTab(stop());
  else editor.focus();
});
const openMenu = (id: string, element: HTMLElement, at?: MouseEvent) => {
  const tab = tabs.value.find((candidate) => candidate.id === id);
  if (!tab) return;
  const items = tabMenu(
    tab,
    indexOf(id),
    tabs.value.length,
    id === activeTabId.value,
    {
      close: (tabId) => close(tabId),
      closeOthers: (tabId) => run(closeOtherTabs(tabId)),
      closeRight: (tabId) => run(closeTabsToRight(tabId)),
      save: (tabId, force) => run(saveFile({ force }, tabId)),
      // after the switch, which closes the dialogs of the tab shown before,
      // unless another switch came after it
      print: (tabId) =>
        void activateTab(tabId)
          .then(() => {
            if (activeTabId.value === tabId) run(print());
          })
          .catch((error: unknown) =>
            logError("failed to open the print dialog of a tab", error),
          ),
      copyPath: (path) => void writeText(path).catch(console.error),
    },
    !engineless(),
  );
  menu.openAt(element, items, {
    anchor: at && { left: at.clientX, top: at.clientY, bottom: at.clientY },
    toggles: false,
  });
};

const onKeydown = (event: KeyboardEvent) => {
  const id = tabIdOf(event.target);
  if (id === null) return;
  const action = tabKey(event, indexOf(id), tabs.value.length);
  if (action === null) return;
  event.preventDefault();
  if (typeof action === "object") {
    focusTab(tabs.value[action.move].id);
  } else if (action === "logo") {
    focusLogo();
  } else if (action === "activate") {
    run(selectTab(id), false);
  } else if (action === "close") {
    close(id, true);
  } else if (action === "menu") {
    openMenu(id, event.target as HTMLElement);
  } else {
    editor.focus();
  }
};

// the keys on the logo move to the tabs, or back to the text
const onLogoKeydown = (event: KeyboardEvent) => {
  const action = logoKey(event, tabs.value.length);
  if (action === null) return;
  event.preventDefault();
  if (typeof action === "object") focusTab(tabs.value[action.move].id);
  else editor.focus();
};

// dragging a tab moves it along the row
const drag = tabDrag({
  boxes: () => tabElements().map((element) => element.getBoundingClientRect()),
  indexOf,
  move: (id, by) => moveTab(id, by),
  capture: (pointerId) => list.value?.setPointerCapture?.(pointerId),
});

// a middle click closes the tab it was pressed and let go on
let middlePressed: string | null = null;
// when × was last clicked, so a quick second click on what slid under the
// pointer, another tab's × or the empty row, does nothing
let closedAt = -Infinity;
const DOUBLE_CLICK = 500;

const onPointerdown = (event: PointerEvent) => {
  const id = tabIdOf(event.target);
  if (event.button === 1) middlePressed = id;
  if (id !== null && !onClose(event.target)) drag.down(event, id);
};

const onMouseup = (event: MouseEvent) => {
  if (event.button !== 1) return;
  const id = tabIdOf(event.target);
  if (middleCloses(middlePressed, id)) close(id!);
  middlePressed = null;
};

const onClick = (event: MouseEvent) => {
  if (!drag.clicked()) return;
  const id = tabIdOf(event.target);
  if (id === null) return;
  if (!onClose(event.target)) return void run(selectTab(id));
  if (event.timeStamp - closedAt < DOUBLE_CLICK) return;
  closedAt = event.timeStamp;
  close(id);
};

const onContextmenu = (event: MouseEvent) => {
  const element = (event.target as Element).closest<HTMLElement>("[role=tab]");
  const id = tabIdOf(element);
  if (!element || id === null) return;
  event.preventDefault();
  openMenu(id, element, event);
};

// a double click on the row's empty part opens a new tab
const onDblclick = (event: MouseEvent) => {
  const target = event.target as Element;
  if (event.timeStamp - closedAt < DOUBLE_CLICK) return;
  if (target === list.value || target === spare.value)
    run(commandFor(C.FILE_NEW));
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

// the tab shown is always scrolled into view, and keeps the focus while the
// tab row has it
watch(
  activeTabId,
  (id) => {
    if (tabRowFocused.value) focusTab(id);
    else focused.value = null;
    const element = list.value;
    const tab = elementOf(id);
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

// F6 comes to the tab row after the text; a menu of a tab keeps the tab that
// opened it in the tab order
const row = useTemplateRef<HTMLElement>("row");
const { onFocusin, onFocusout } = useFocusRegion(
  () => row.value,
  tabRowFocused,
  {
    id: "tabs",
    order: FOCUS_ORDER.tabs,
    focus: () => focusTab(activeTabId.value),
  },
  (to) => {
    if (!to?.closest(".context-menus")) focused.value = null;
  },
);

// the Blocks button drops its name once the tabs need the room, measured
// once a frame, after the row has its size
const compact = shallowRef(false);
let labelWidth = 0;
let frame: number | undefined;
const fit = () => {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    const element = list.value;
    if (!element) return;
    labelWidth = label.value?.offsetWidth || labelWidth;
    compact.value = compactBlocks(
      compact.value,
      element.scrollWidth > element.clientWidth + 1,
      spare.value?.clientWidth ?? 0,
      labelWidth,
    );
  });
};
useResizeObserver(() => [list.value, spare.value], fit);
watch(() => tabs.value.length, fit, { flush: "post" });
onUnmounted(() => {
  if (frame !== undefined) cancelAnimationFrame(frame);
});
</script>

<template>
  <div
    id="tab-row"
    ref="row"
    class="top-row tab-row"
    @focusin="onFocusin"
    @focusout="onFocusout"
  >
    <LogoButton
      ref="logo"
      :tabindex="stop() === LOGO ? 0 : -1"
      @keydown="onLogoKeydown"
    />
    <div
      ref="list"
      class="tab-list"
      role="tablist"
      aria-label="Documents"
      @keydown="onKeydown"
      @pointerdown="onPointerdown"
      @pointermove="drag.move"
      @pointerup="drag.up"
      @pointercancel="drag.up"
      @mouseup="onMouseup"
      @click="onClick"
      @contextmenu="onContextmenu"
      @wheel="onWheel"
      @dblclick="onDblclick"
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
      :label="newLabel"
      :command="C.FILE_NEW"
      :focusable="false"
      @click="run(commandFor(C.FILE_NEW))"
    />
    <div ref="spare" class="tab-row-spare" @dblclick="onDblclick" />
    <IconButton
      class="tab-row-blocks"
      :class="{ compact }"
      icon="blocks"
      label="Blocks"
      :tip="blocksTip"
      :command="C.INSERT_BLOCK"
      :pressed="blocksPaneOpen"
      :focusable="false"
      @click="run(commandFor(C.VIEW_BLOCKS), false)"
    >
      <span v-if="!compact" ref="label">Blocks</span>
    </IconButton>
  </div>
</template>
