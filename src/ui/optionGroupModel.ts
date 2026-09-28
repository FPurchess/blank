import type { Option } from "../layout/choices";

// A row of options, as `OptionGroup.vue` shows it: one checked option (a
// radio group) or options that are each on or off (toggle buttons), which
// ←→ move between.

// what a row holds: the value of its checked option, or the values that are on
export type OptionValue = string | number;
export type Chosen<T extends OptionValue> = T | T[];

/**
 * isOn returns whether `value` is the checked option or one that is on
 */
export const isOn = <T extends OptionValue>(chosen: Chosen<T>, value: T) =>
  Array.isArray(chosen) ? chosen.includes(value) : chosen === value;

/**
 * chooseAt returns what the row holds once the option at `index` is pressed:
 * that option in a radio group, or with that option switched, in the order of
 * `options`, for toggle buttons
 */
export const chooseAt = <T extends OptionValue>(
  chosen: Chosen<T>,
  options: Option<T>[],
  index: number,
): Chosen<T> => {
  const { value } = options[index];
  if (!Array.isArray(chosen)) return value;
  return options
    .map((option) => option.value)
    .filter((v) => (v === value) !== chosen.includes(v));
};

/**
 * firstStop returns the option that is in the tab order when the row is
 * shown: the checked one of a radio group, else the first
 */
export const firstStop = <T extends OptionValue>(
  chosen: Chosen<T>,
  options: Option<T>[],
) =>
  Array.isArray(chosen)
    ? 0
    : Math.max(
        0,
        options.findIndex((option) => option.value === chosen),
      );

/**
 * stepTo returns the option that `key` moves to from `index`, wrapping around
 * (→ ← Home End), or undefined for another key
 */
export const stepTo = (key: string, index: number, count: number) => {
  const moves: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: count - 1,
  };
  return key in moves ? (moves[key] + count) % count : undefined;
};
