import type { ShallowRef } from "vue";

/**
 * closeDialog closes the dialog of `requests`, then runs `callback`, which
 * does what the user chose and gives the editor the focus back. In this
 * order, uiTakesFocus is already false when the editor takes the focus, and a
 * callback that opens a new request isn't closed right after. Vue removes the
 * dialog's DOM on the next tick.
 */
export const closeDialog = (
  requests: ShallowRef<unknown>,
  callback: () => void,
) => {
  requests.value = null;
  callback();
};
