import type { Transaction } from "prosemirror-state";
import { onScopeDispose, shallowRef, watch } from "vue";

import { proseText } from "../editor/text";
import { bootScope } from "../scope";

// the file the document is saved to, or null while it's untitled
export const path = shallowRef<string | null>(null);

// the Word document the untitled document was imported from, which suggests
// where to save it; null otherwise
export const importedFrom = shallowRef<string | null>(null);

// the editor's latest transaction; every one of them lands here
export const transaction = shallowRef<Transaction | null>(null);

// the document's text, for the word and character counter
export const textContent = shallowRef("");

// how long textContent waits for typing to pause
const TEXT_CONTENT_DELAY = 50;

/**
 * bootDocumentState keeps textContent up to date, 50 ms after the last
 * transaction
 * @returns dispose, which stops updating it
 */
export const bootDocumentState = () =>
  bootScope(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // after the writes of a tick, so the timer is reset once per tick rather
    // than once per transaction
    watch(transaction, (tx) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!tx) return;
        const { doc } = tx;
        // blocks and inline leaves like hard breaks and images apart by a
        // space, without the sources of math and diagrams
        textContent.value = proseText(doc);
      }, TEXT_CONTENT_DELAY);
    });
    onScopeDispose(() => clearTimeout(timer));
  });
