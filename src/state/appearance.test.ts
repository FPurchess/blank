import { afterEach, describe, expect, it } from "vitest";

import {
  bootAppearance,
  colorMode,
  exposeAppearance,
  theme,
} from "./appearance";

describe("appearance", () => {
  let dispose = () => {};

  afterEach(() => {
    dispose();
    theme.value = "light";
    colorMode.value = "accent";
  });

  it("applies the theme to the document body right away", () => {
    theme.value = "dark";
    dispose = bootAppearance();

    expect(document.body.dataset.theme).toBe("dark");
  });

  it("follows the theme", () => {
    dispose = bootAppearance();

    theme.value = "red";
    expect(document.body.dataset.theme).toBe("red");
    theme.value = "light";
    expect(document.body.dataset.theme).toBe("light");
  });

  it("stops following the theme once disposed", () => {
    dispose = bootAppearance();
    theme.value = "green";
    dispose();

    theme.value = "blue";
    expect(document.body.dataset.theme).toBe("green");
  });

  it("applies the color mode next to the theme", () => {
    dispose = bootAppearance();
    expect(document.body.dataset.color).toBe("accent");

    colorMode.value = "mono";
    expect(document.body.dataset.color).toBe("mono");
    expect(document.body.dataset.theme).toBe("light");
  });

  it("lets the debug hook switch to a theme, and ignores what isn't one", () => {
    exposeAppearance();
    const { blankSetTheme } = window as unknown as {
      blankSetTheme: (name: unknown) => void;
    };

    blankSetTheme("dark");
    expect(theme.value).toBe("dark");
    blankSetTheme("purple");
    expect(theme.value).toBe("dark");
  });
});
