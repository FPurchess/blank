import { computed, shallowRef } from "vue";

import { config } from "../config";
import { uiTakesFocus } from "./focus";
import { languagePicker } from "./language";
import { announce } from "./messages";
import { outlinePeek } from "./outline";
import { tablePicker, wordCountCard } from "./popups";

// Focus mode lets the controls fade while the user writes (src/ui/focusModeModel.ts,
// see .claude/rules/focus-mode.md). Blank always starts without it.

// whether focus mode is on: the controls may fade
export const focusMode = shallowRef(false);

// whether the controls have faded out, in focus mode only
export const controlsFaded = shallowRef(false);

// controlsStay is whether something is open that the controls stay for, so
// they don't fade and Esc closes it instead of leaving focus mode: a dialog
// or the header and footer strip, a menu, a picker, the outline's peek or
// the word count card, or a part of the window that holds the focus (the tab
// row, the toolbar, the blocks pane)
export const controlsStay = computed(
  () =>
    uiTakesFocus.value ||
    languagePicker.value.open ||
    tablePicker.value !== null ||
    outlinePeek.value !== null ||
    wordCountCard.value,
);

/**
 * focusModeMessage returns what entering focus mode announces, for a rest
 * time of `seconds` (0 for none)
 */
export const focusModeMessage = (seconds: number) =>
  seconds > 0
    ? `Focus mode: the controls fade when you type or after ${seconds} s; move the mouse to bring them back`
    : "Focus mode: the controls fade when you type; move the mouse to bring them back";

/**
 * leaveFocusMode turns focus mode off on Esc, unless something is open that
 * Esc closes first
 * @returns whether it did
 */
export const leaveFocusMode = () => {
  if (!focusMode.value || controlsStay.value) return false;
  setFocusMode(false);
  return true;
};

/**
 * setFocusMode turns focus mode on or off; off brings the controls back
 */
export const setFocusMode = (on: boolean) => {
  if (focusMode.value === on) return;
  focusMode.value = on;
  if (on) announce(focusModeMessage(config.value.focusMode.hideAfter));
  else {
    controlsFaded.value = false;
    announce("Focus mode off");
  }
};
