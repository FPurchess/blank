import { computed } from "vue";

import { focusTakingDialogs } from "./dialogs";
import { contextMenu, tableToolbar } from "./popups";

// uiTakesFocus is whether a part of the UI holds the focus, which the editor
// leaves it: the dialogs, the header and footer strips, the context menu and
// the caption field of the table toolbar. The pickers and the toolbar's
// buttons never take it, since the editor handles their keys.
export const uiTakesFocus = computed(
  () =>
    focusTakingDialogs.some((request) => request.value !== null) ||
    contextMenu.value !== null ||
    !!tableToolbar.value?.caption,
);
