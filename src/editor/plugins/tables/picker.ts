import { keydownHandler } from "prosemirror-keymap";
import { Plugin } from "prosemirror-state";

import { CommandIdentifier, getKeyBinding } from "../../../config";
import { tablePicker } from "../../../state";
import { resizePicker } from "../../../tablePicker";
import { normalizeBinding } from "../keymap";

/**
 * tablePickerKeys handles the keyboard while the table picker is open, so the
 * editor keeps the focus and nothing typed reaches the document
 */
export const tablePickerKeys = () => {
  // the binding that opened the picker closes it again
  const binding = normalizeBinding(
    getKeyBinding(CommandIdentifier.INSERT_TABLE),
  );
  const toggle = keydownHandler(
    binding
      ? {
          [binding]: () => {
            tablePicker.value?.cancel();
            return true;
          },
        }
      : {},
  );

  return new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        const picker = tablePicker.value;
        if (!picker) return false;
        if (toggle(view, event)) return true;

        const steps: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const step = steps[event.key];
        if (step) resizePicker(...step);
        else if (event.key === "Enter") picker.submit(picker.cols, picker.rows);
        else if (
          !["Shift", "Control", "Alt", "Meta", "AltGraph"].includes(event.key)
        ) {
          // Esc and any other key close the picker without typing
          picker.cancel();
        }
        return true;
      },
      handleTextInput: () => tablePicker.value !== null,
      handleDOMEvents: {
        mousedown: () => {
          tablePicker.value?.cancel();
          return false;
        },
      },
    },
  });
};
