import { Plugin } from "prosemirror-state";

import { tablePicker } from "../../../state";
import { resizePicker } from "../../commands/table/pickerSize";
import { CommandIdentifier } from "../../../config";
import { commandKey } from "../../keyBindings";
import { PAGE_PRESS } from "../../pagePointer";

/**
 * tablePickerKeys handles the keyboard while the table picker is open, so the
 * editor keeps the focus and nothing typed reaches the document
 */
export const tablePickerKeys = () => {
  // the binding that opened the picker closes it again
  const toggle = commandKey(CommandIdentifier.INSERT_TABLE, () => {
    tablePicker.value?.cancel();
    return true;
  });

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
        [PAGE_PRESS]: () => {
          tablePicker.value?.cancel();
          return false;
        },
      },
    },
  });
};
