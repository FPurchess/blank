import { shallowRef, watch } from "vue";

// each needs a partial in src/scss/themes/, which _index.scss uses
export const themes = [
  "light",
  "dark",
  "black",
  "red",
  "green",
  "blue",
] as const;

export type ThemeName = (typeof themes)[number];
export const theme = shallowRef<ThemeName>("light");

export const isTheme = (value: unknown): value is ThemeName =>
  (themes as readonly unknown[]).includes(value);

/**
 * bootAppearance applies the theme to the document body, which the themes
 * in src/scss/themes/ key off. It applies it right away, so a stored theme
 * shows before the first paint.
 * @returns dispose, which stops applying it
 */
export const bootAppearance = () =>
  watch(
    theme,
    (value) => {
      document.body.dataset.theme = value;
    },
    { flush: "sync", immediate: true },
  );
