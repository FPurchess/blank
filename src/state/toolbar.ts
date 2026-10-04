import { shallowRef } from "vue";

// The formatting toolbar in the top area (src/ui/FormatToolbar.vue). Its
// buttons take the focus only from the keyboard (Alt-F10, F6): it is part of
// uiTakesFocus while it holds it.

// whether the focus is in the toolbar, which the editor then leaves it
export const toolbarFocused = shallowRef(false);

// asks the toolbar to take the focus: a new object each time, so asking
// twice does it twice
export const toolbarFocusRequest = shallowRef<object | null>(null);

/**
 * focusToolbar asks the toolbar for the focus, on its last focused button
 */
export const focusToolbar = () => {
  toolbarFocusRequest.value = {};
};
