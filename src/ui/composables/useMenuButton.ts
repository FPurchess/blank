import { computed } from "vue";

import { type Anchor, contextMenu, type MenuItem } from "../../state";

/**
 * useMenuButton makes a button open a menu (ContextMenu.vue) below or above
 * it, and close it again on a second click: the button is the menu's
 * `owner`, so its press doesn't count as outside the menu. The menu opens
 * from the keyboard, its first item focused, when the button has the focus.
 * @param closed what to do once the menu closed, e.g. give the editor the
 *   focus back
 */
export const useMenuButton = (closed: () => void) => {
  // one per button, which tells its menu apart from any other
  const close = () => {
    // a menu opened since then stays
    if (contextMenu.value?.close === close) contextMenu.value = null;
    closed();
  };
  const isOpen = computed(() => contextMenu.value?.close === close);

  /**
   * openAt opens the menu of `items` for `owner`: at `anchor`, e.g. the
   * pointer, or below or above the owner; from the keyboard, its first item
   * focused, when the owner has the focus. With `toggles` false, a press on
   * the owner closes the menu rather than counting as inside it, e.g. for
   * the menu of a tab, whose click shows the tab.
   */
  const openAt = (
    owner: HTMLElement,
    items: MenuItem[],
    { anchor, toggles = true }: { anchor?: Anchor; toggles?: boolean } = {},
  ) => {
    const { left, top, bottom } = owner.getBoundingClientRect();
    contextMenu.value = {
      items,
      anchor: anchor ?? { left, top, bottom },
      keyboard: document.activeElement === owner,
      close,
      ...(toggles && { owner }),
    };
  };

  const toggle = (event: MouseEvent, items: MenuItem[]) => {
    if (isOpen.value) return close();
    openAt(event.currentTarget as HTMLElement, items);
  };

  return { toggle, openAt, isOpen };
};
