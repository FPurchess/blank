import { shallowRef } from "vue";

import { shownIn } from "../../dom";
import { stepTo } from "../rovingModel";

/**
 * useRovingFocus keeps one control of a row in the tab order, `current`,
 * which ← → Home End move the focus between, wrapping around: the controls
 * `selectors` finds in `root()` that aren't hidden. The row binds
 * `tabindex="index === current ? 0 : -1"` and passes its keys to `onKeydown`.
 * @param start the control in the tab order at first
 * @param moved told the control the keys moved to, e.g. to choose it
 * @returns `onKeydown`, which says whether it took the key, and
 *   `focusCurrent`
 */
export const useRovingFocus = (
  root: () => HTMLElement | null | undefined,
  selectors: string,
  start = 0,
  moved?: (index: number) => void,
) => {
  const current = shallowRef(start);
  const controls = () => {
    const element = root();
    return element ? shownIn(element, selectors) : [];
  };
  const focusCurrent = () => {
    const shown = controls();
    current.value = Math.min(current.value, Math.max(0, shown.length - 1));
    shown[current.value]?.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    const shown = controls();
    const next = stepTo(event.key, current.value, shown.length);
    if (next === undefined) return false;
    event.preventDefault();
    current.value = next;
    moved?.(next);
    shown[next]?.focus();
    return true;
  };
  return { current, onKeydown, focusCurrent };
};
