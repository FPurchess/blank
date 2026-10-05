import { onScopeDispose, watch } from "vue";

import { CHROME_SELECTOR } from "../chrome";
import { config } from "../config";
import { listenOnWindow } from "../scope";
import {
  controlsFaded,
  controlsStay,
  focusMode,
  leaveFocusMode,
  tooltipsSuppressed,
} from "../state";

// When the controls fade in focus mode and come back (App.vue runs it, see
// .claude/rules/focus-mode.md).

// how far the pointer moves before the controls come back, in px: a nudged
// desk doesn't count
export const POINTER_TRAVEL = 6;

// keys that change the text besides the characters
const EDITING_KEYS = new Set(["Enter", "Backspace", "Delete", "Tab"]);

/**
 * isTypingKey tells whether `event` changes the text: a character (also one
 * typed with AltGr, which Windows reports as Ctrl+Alt, or with Option on a
 * Mac), Enter, Backspace, Delete or Tab; not the arrows, nor shortcuts
 */
export const isTypingKey = (event: KeyboardEvent) => {
  const command = event.ctrlKey || event.metaKey;
  const altGraph = event.getModifierState?.("AltGraph") ?? false;
  if (event.key.length === 1) return !command || altGraph;
  return EDITING_KEYS.has(event.key) && !command;
};

/**
 * watchFocusMode fades the controls in focus mode while the user writes: on a
 * key that changes the text, or once the pointer has rested for the rest time
 * of the settings, and brings them back when the pointer moves. They never
 * fade while the pointer is on one of them, or while something is open that
 * they stay for (controlsStay). Esc leaves focus mode when nothing else takes
 * it. Runs in the scope of the component that calls it.
 */
export const watchFocusMode = () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let travel = 0;
  let last: { x: number; y: number } | undefined;
  let onChrome = false;

  const mayFade = () => focusMode.value && !controlsStay.value && !onChrome;
  const fade = () => {
    controlsFaded.value = true;
    travel = 0;
  };
  // the rest timer starts again whenever the pointer moves
  const restart = () => {
    clearTimeout(timer);
    timer = undefined;
    const seconds = config.value.focusMode.hideAfter;
    if (!focusMode.value || seconds === 0) return;
    timer = setTimeout(() => {
      if (mayFade()) fade();
      else restart();
    }, seconds * 1000);
  };

  listenOnWindow(
    "keydown",
    (event) => {
      if (isTypingKey(event) && mayFade()) fade();
    },
    { capture: true },
  );
  // Esc outside the text, after everything else that takes it (in the text,
  // the editor's focusModeKeys handles it)
  listenOnWindow("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !event.defaultPrevented &&
      !(event.target instanceof Element && event.target.closest("#editor")) &&
      leaveFocusMode()
    )
      event.preventDefault();
  });
  listenOnWindow("pointermove", (event) => {
    onChrome =
      event.target instanceof Element &&
      !!event.target.closest(CHROME_SELECTOR);
    if (last)
      travel += Math.hypot(event.clientX - last.x, event.clientY - last.y);
    last = { x: event.clientX, y: event.clientY };
    if (travel <= POINTER_TRAVEL) return;
    travel = 0;
    controlsFaded.value = false;
    restart();
  });
  // the focus moving to a control (F6, Alt-F10) brings them back
  listenOnWindow("focusin", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest(CHROME_SELECTOR)
    )
      controlsFaded.value = false;
  });

  watch([focusMode, () => config.value.focusMode.hideAfter], () => restart(), {
    immediate: true,
  });
  // what opens, a dialog or a menu, brings them back
  watch(controlsStay, (stay) => {
    if (stay) controlsFaded.value = false;
  });
  watch(controlsFaded, (faded) => (tooltipsSuppressed.value = faded), {
    immediate: true,
  });
  watch(focusMode, (on) => {
    if (!on) controlsFaded.value = false;
  });

  onScopeDispose(() => clearTimeout(timer));
};
