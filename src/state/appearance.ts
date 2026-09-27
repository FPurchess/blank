import { shallowRef, watch } from "vue";

export const themes: string[] = [
  "light",
  "dark",
  "black",
  "red",
  "green",
  "blue",
];

export type themeType = (typeof themes)[number];
export const theme = shallowRef<themeType>("light");

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
