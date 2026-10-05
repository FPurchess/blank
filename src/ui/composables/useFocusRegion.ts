import { onUnmounted, type Ref } from "vue";

import { type FocusStop, registerFocusStop } from "../../state";

/**
 * useFocusRegion keeps `focused` (a flag of uiTakesFocus) true while the
 * focus is in `root()`, so the editor leaves it there, and false once it
 * left or the component went. With `stop`, F6 comes to the part too, in the
 * order of `stop.order`.
 * @param left told where the focus went when it left, e.g. to keep a
 *   control in the tab order while a menu it opened has the focus
 * @returns the handlers for the root's focusin and focusout
 */
export const useFocusRegion = (
  root: () => HTMLElement | null | undefined,
  focused: Ref<boolean>,
  stop?: Omit<FocusStop, "has">,
  left?: (to: Element | null) => void,
) => {
  if (stop) {
    onUnmounted(
      registerFocusStop({
        ...stop,
        has: (element) => !!element && !!root()?.contains(element),
      }),
    );
  }
  onUnmounted(() => (focused.value = false));
  const onFocusin = () => (focused.value = true);
  const onFocusout = (event: FocusEvent) => {
    const to = event.relatedTarget as Element | null;
    if (root()?.contains(to)) return;
    focused.value = false;
    left?.(to);
  };
  return { onFocusin, onFocusout };
};
