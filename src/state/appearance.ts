import { shallowRef, watch } from "vue";

import { announce } from "./messages";

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
 * themeLabel returns the name of a theme, e.g. "Dark"
 */
export const themeLabel = (name: ThemeName) =>
  name.charAt(0).toUpperCase() + name.slice(1);

/**
 * chooseTheme makes `name` the theme and says so, e.g. "Dark theme", as the
 * settings' theme cards and the main menu's swatches choose one
 */
export const chooseTheme = (name: ThemeName) => {
  if (theme.value === name) return;
  theme.value = name;
  announce(`${themeLabel(name)} theme`);
};

// whether what can be clicked or is on shows in the theme's accent, or in
// its ink ("mono"), which src/scss/_tokens.scss switches on the body
export type ColorMode = "accent" | "mono";
export const colorMode = shallowRef<ColorMode>("accent");

/**
 * bootAppearance applies the theme and the color mode to the document body,
 * which the themes and tokens in src/scss/ key off. It applies them right
 * away, so a stored theme shows before the first paint.
 * @returns dispose, which stops applying them
 */
export const bootAppearance = () =>
  watch(
    [theme, colorMode],
    ([value, mode]) => {
      document.body.dataset.theme = value;
      document.body.dataset.color = mode;
    },
    { flush: "sync", immediate: true },
  );

/**
 * exposeAppearance lets the docs shots switch the theme for a moment, to
 * capture each frame in light and dark, through `window.blankSetTheme`
 * (debug builds only, see src/main.ts)
 */
export const exposeAppearance = () => {
  Object.assign(window, {
    blankSetTheme: (name: unknown) => {
      if (isTheme(name)) theme.value = name;
    },
  });
};
