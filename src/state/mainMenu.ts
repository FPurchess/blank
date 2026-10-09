import { shallowRef } from "vue";

// The main menu behind the logo (src/ui/LogoButton.vue), see
// .claude/rules/main-menu.md.

// asks the logo to open the main menu, e.g. for its key: a new object each
// time, so the same ask twice is two
export const mainMenuWanted = shallowRef<object | null>(null);
