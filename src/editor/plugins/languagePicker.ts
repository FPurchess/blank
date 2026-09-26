import { Plugin } from "prosemirror-state";
import { keydownHandler } from "prosemirror-keymap";

import { CommandIdentifier, getKeyBinding } from "../../config";
import {
  backspace,
  closePicker,
  confirm,
  move,
  typeChar,
} from "../../languagePicker";
import { languagePicker as pickerState } from "../../state";

/**
 * languagePicker handles the keyboard while the language picker is open, so
 * the editor keeps the focus and nothing typed reaches the document
 */
export const languagePicker = () => {
  // the binding that opened the picker closes it again
  const toggle = keydownHandler({
    [getKeyBinding(CommandIdentifier.LANGUAGE_CHOOSE)]: () => {
      closePicker();
      return true;
    },
  });

  return new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        if (!pickerState.value.open) return false;
        if (toggle(view, event)) return true;

        const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
        if (event.key === "ArrowLeft") move(-1);
        else if (event.key === "ArrowRight") move(1);
        else if (event.key === "Enter") confirm();
        else if (event.key === "Escape") closePicker();
        else if (event.key === "Backspace") backspace();
        else if (plain && /^[a-z-]$/i.test(event.key)) typeChar(event.key);
        // any other key is swallowed while the picker is open
        return true;
      },
      handleTextInput: () => pickerState.value.open,
      handleDOMEvents: {
        mousedown: () => {
          if (pickerState.value.open) closePicker();
          return false;
        },
      },
    },
  });
};
