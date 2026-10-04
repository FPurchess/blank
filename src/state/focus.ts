import { computed } from "vue";

import { blocksPaneFocused } from "./blocksPane";
import { focusTakingDialogs } from "./dialogs";
import { contextMenu, tableToolbar } from "./popups";

// uiTakesFocus is whether a part of the UI holds the focus, which the editor
// leaves it: the dialogs, the header and footer strips, the context menu and
// the caption field of the table toolbar, and the blocks pane while the
// focus is in it. The pickers and the toolbar's
// buttons never take it, since the editor handles their keys.
export const uiTakesFocus = computed(
  () =>
    focusTakingDialogs.some((request) => request.value !== null) ||
    contextMenu.value !== null ||
    blocksPaneFocused.value ||
    !!tableToolbar.value?.caption,
);
