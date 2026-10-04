import { shallowRef } from "vue";

import type { Definition } from "../markdown/blocks/definitions";

// The blocks pane at the left of the pages (src/ui/BlocksPane.vue): the
// content blocks that can be inserted, as tiles. It takes the focus, so it
// is part of uiTakesFocus while it holds it.

// a group of tiles, in the order the pane shows them
export type BlockGroup = "contents" | "forms" | "drawings";

export interface BlockChoice {
  id: string;
  group: BlockGroup;
  label: string;
  // what it is, in a few words, or why it can't be inserted
  description: string;
  // a form whose file can't be used
  disabled?: boolean;
  // a form's definition, which its tile draws
  definition?: Definition;
}

// whether the user keeps the pane open, kept across restarts (see
// storage.ts)
export const blocksPaneOpen = shallowRef(false);

// whether the focus is in the pane, which the editor then leaves it
export const blocksPaneFocused = shallowRef(false);

// the blocks the pane offers, read again whenever it opens (see
// src/editor/commands/contentBlocks.ts)
export const blockChoices = shallowRef<readonly BlockChoice[]>([]);

// asks the pane to put the focus into its search: a new object each time,
// so asking twice does it twice
export const blocksPaneSearch = shallowRef<{ id: number } | null>(null);

let asked = 0;

/**
 * focusBlocksSearch asks the pane to put the focus into its search
 */
export const focusBlocksSearch = () => {
  blocksPaneSearch.value = { id: ++asked };
};
