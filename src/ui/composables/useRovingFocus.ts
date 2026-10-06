import { shallowRef } from "vue";

import { shownIn } from "../../dom";
import { type Orientation, stepTo } from "../rovingModel";

/**
 * useRovingFocus keeps one control of a row in the tab order, `current`,
 * which ← → Home End move the focus between, wrapping around: the controls
 * `selectors` finds in `root()` that aren't hidden. The row binds
 * `tabindex="index === current ? 0 : -1"` and passes its keys to `onKeydown`.
 * @param start the control in the tab order at first
 * @param moved told the control the keys moved to, e.g. to choose it
 * @param orientation which arrows move: ←→ by default, ↑↓ in a column
 * @returns `onKeydown`, which says whether it took the key; `follow`, which
 *   makes the control the focus or a click went to the current one;
 *   `clamp`, which keeps `current` in the row after it lost controls; and
 *   `focusCurrent`
 */
export const useRovingFocus = (
  root: () => HTMLElement | null | undefined,
  selectors: string,
  start = 0,
  moved?: (index: number) => void,
  orientation: Orientation = "horizontal",
) => {
  const current = shallowRef(start);
  const controls = () => {
    const element = root();
    return element ? shownIn(element, selectors) : [];
  };
  const clamp = () => {
    const last = Math.max(0, controls().length - 1);
    if (current.value > last) current.value = last;
  };
  const focusCurrent = () => {
    clamp();
    controls()[current.value]?.focus();
  };
  const follow = (control: EventTarget | null) => {
    const index = controls().indexOf(control as HTMLElement);
    if (index >= 0) current.value = index;
  };
  const onKeydown = (event: KeyboardEvent) => {
    // with Ctrl, Alt or Meta the keys are the window's, e.g. to move a tab
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    const shown = controls();
    const next = stepTo(event.key, current.value, shown.length, orientation);
    if (next === undefined) return false;
    event.preventDefault();
    current.value = next;
    moved?.(next);
    shown[next]?.focus();
    return true;
  };
  return { current, onKeydown, follow, clamp, focusCurrent };
};
