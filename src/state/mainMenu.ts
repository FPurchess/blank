import { computed, shallowRef } from "vue";

import { contextMenu } from "./popups";

// The main menu behind the logo (src/ui/LogoButton.vue), see
// .claude/rules/main-menu.md.

// asks the logo to open the main menu, e.g. for its key: a new object each
// time, which the logo serves once
export const mainMenuWanted = shallowRef<{ id: number } | null>(null);

// whether the main menu is open: the menu with a search
export const mainMenuOpen = computed(() => !!contextMenu.value?.search);
