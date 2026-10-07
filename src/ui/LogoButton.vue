<script setup lang="ts">
import { type ComponentPublicInstance, useTemplateRef, watch } from "vue";

import { CommandIdentifier as C } from "../config";
import { openRecentFile } from "../editor/commands/recentFiles";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import {
  blocksPaneOpen,
  chooseTheme,
  engineMissing,
  focusMode,
  mainMenuWanted,
  outlinePinned,
  pageView,
  pageZoom,
  recentCommands,
  recentFiles,
  theme,
  zoomFactor,
  zoomLabel,
} from "../state";
import BlankLogo from "./BlankLogo.vue";
import IconButton from "./components/IconButton.vue";
import { useMenuButton } from "./composables/useMenuButton";
import {
  type MainMenuDeps,
  mainMenuItems,
  mainMenuSearch,
} from "./mainMenuModel";

// The logo at the left of the tab row, which opens the main menu below it,
// as its key (Mod-K) does, with the focus in the menu's search. The tab row
// puts it in its row of tabs (TabRow.vue). See .claude/rules/main-menu.md.
defineProps<{ tabindex: number }>();

const editor = useEditor();
const button = useTemplateRef<ComponentPublicInstance>("button");
const element = () => button.value?.$el as HTMLElement | undefined;
// closed, the focus goes back to the logo if the keyboard opened it there,
// else to the text
const menu = useMenuButton((keyboard) => {
  if (keyboard) element()?.focus();
  else editor.focus();
});

// what the menu reads and does, as the window is now
const deps = (): MainMenuDeps => ({
  can: (id) => editor.can(commandFor(id)),
  // a switch keeps the focus in the menu, which stays open
  run: (id, stays) => editor.run(commandFor(id), { focus: !stays }),
  recent: recentCommands.value,
  files: recentFiles.value,
  openFile: (path) => editor.run(openRecentFile(path)),
  zoom: zoomLabel(pageZoom.value, zoomFactor.value).text,
  pages: !engineMissing.value,
  theme: theme.value,
  chooseTheme,
  on: {
    [C.VIEW_BLOCKS]: blocksPaneOpen.value,
    [C.VIEW_OUTLINE]: outlinePinned.value,
    [C.VIEW_PAGES]: pageView.value === "pages",
    [C.VIEW_FOCUS_MODE]: focusMode.value,
  },
});
const request = () => {
  const now = deps();
  return {
    items: mainMenuItems(now),
    extra: { search: mainMenuSearch(now), fill: true },
  };
};

const toggle = (event: Event) => {
  const { items, extra } = request();
  menu.toggle(event, items, extra);
};

// its key opens it; while it's open, the menu takes the key itself
watch(mainMenuWanted, (wanted) => {
  const owner = element();
  if (!wanted || !owner || menu.isOpen.value) return;
  const { items, extra } = request();
  menu.openAt(owner, items, { extra });
});

// what a switch, the zoom or a theme in it changed shows at once
watch(
  [
    theme,
    pageZoom,
    zoomFactor,
    pageView,
    focusMode,
    outlinePinned,
    blocksPaneOpen,
    recentFiles,
    engineMissing,
  ],
  () => {
    if (menu.isOpen.value) menu.update(request().items);
  },
);

defineExpose({ focus: () => element()?.focus() });
</script>

<template>
  <IconButton
    ref="button"
    class="logo-button"
    label="Main menu"
    :command="C.MENU_MAIN"
    :tabindex="tabindex"
    aria-haspopup="menu"
    :aria-expanded="menu.isOpen.value"
    @click="toggle"
  >
    <BlankLogo />
  </IconButton>
</template>
