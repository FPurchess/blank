import { afterEach, describe, expect, it } from "vitest";

import { bootAppearance, theme } from "./appearance";

describe("appearance", () => {
  let dispose = () => {};

  afterEach(() => {
    dispose();
    theme.value = "light";
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
});
