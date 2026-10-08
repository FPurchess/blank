import type { ShallowRef } from "vue";

import { closePicker } from "../languagePicker";
import {
  bandEditorDone,
  closeDialog,
  contextMenu,
  imageDialog,
  languagePicker,
  linkDialog,
  outlinePeek,
  pageSetup,
  printDialog,
  tablePicker,
  tableToolbar,
  tocPopover,
  unsavedDialog,
  wordCountCard,
} from "../state";

/**
 * close closes the request in `requests`, if one is open, with `how`
 */
const close = <T>(
  requests: ShallowRef<T | null>,
  how: (request: T) => void,
) => {
  const request = requests.value;
  if (request) closeDialog(requests, () => how(request));
};

/**
 * closeRequests closes everything open that works on the shown document, as
 * cancelling it does, e.g. before another tab shows: the dialogs, menus,
 * pickers and popovers. The header or footer strip keeps what was typed, as a
 * click outside it does.
 */
export const closeRequests = () => {
  close(linkDialog, (request) => request.cancel());
  close(imageDialog, (request) => request.cancel());
  close(pageSetup, (request) => request.cancel());
  close(printDialog, (request) => request.cancel());
  close(unsavedDialog, (request) => request.cancel());
  close(tocPopover, (request) => request.close());
  close(contextMenu, (request) => request.close());
  bandEditorDone.value?.();
  tablePicker.value?.cancel();
  tableToolbar.value?.caption?.cancel();
  if (languagePicker.value.open) closePicker();
  wordCountCard.value = false;
  outlinePeek.value = null;
};
