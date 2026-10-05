import { shallowRef } from "vue";

// The formatting toolbar in the top area (src/ui/FormatToolbar.vue). Its
// buttons take the focus only from the keyboard (Alt-F10 and F6, through its
// focus stop "toolbar"): it is part of uiTakesFocus while it holds it.

// whether the focus is in the toolbar, which the editor then leaves it
export const toolbarFocused = shallowRef(false);
