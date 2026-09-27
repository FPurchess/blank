import { onScopeDispose, type ShallowRef, shallowRef, watch } from "vue";

import { bootScope } from "../scope";

// A message shows for a moment, and the same text may come again, e.g. "A
// row added" twice in a row. Each one is a new object, so the second one
// shows and restarts the timer too: a ref doesn't notify for an equal value.
export interface Message {
  text: string;
  // tells apart two messages with the same text
  id: number;
}

let lastId = 0;
const message = (text: string): Message => ({ text, id: ++lastId });

// announcement is a short message about what just happened, e.g. "2 rows
// added", shown in the status bar and read out by screen readers
export const announcement = shallowRef<Message | null>(null);

/**
 * announce tells the user what just happened, see announcement
 */
export const announce = (text: string) => {
  announcement.value = message(text);
};

// spellcheckMessage is a short message shown next to the spell check status,
// e.g. "No spelling errors", or null
export const spellcheckMessage = shallowRef<Message | null>(null);

/**
 * flashSpellcheckMessage shows `text` next to the spell check status, see
 * spellcheckMessage
 */
export const flashSpellcheckMessage = (text: string) => {
  spellcheckMessage.value = message(text);
};

// how long a message shows at least
const MESSAGE_DURATION = 2000;

/**
 * expire clears the message in `messages` `duration(message)` ms after it
 * came. A new message, even with the same text, starts over.
 */
const expire = (
  messages: ShallowRef<Message | null>,
  duration: (message: Message) => number,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    messages,
    (message) => {
      clearTimeout(timer);
      if (message) {
        timer = setTimeout(() => {
          messages.value = null;
        }, duration(message));
      }
    },
    { flush: "sync" },
  );
  onScopeDispose(() => clearTimeout(timer));
};

/**
 * bootMessages shows each message for a moment: a spell check message for 2
 * s, an announcement long enough to read a longer one too
 * @returns dispose, which stops clearing them
 */
export const bootMessages = () =>
  bootScope(() => {
    expire(spellcheckMessage, () => MESSAGE_DURATION);
    expire(announcement, ({ text }) =>
      Math.max(MESSAGE_DURATION, text.length * 60),
    );
  });
