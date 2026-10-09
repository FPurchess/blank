import { describe, expect, it } from "vitest";
import { createApp, h } from "vue";

import SearchField from "./SearchField.vue";

describe("SearchField", () => {
  it("puts its class on the field and the other attributes on the input", () => {
    const element = document.createElement("div");
    const app = createApp(() =>
      h(SearchField, {
        modelValue: "",
        class: "menu-search",
        "aria-label": "Search commands",
      }),
    );
    app.mount(element);
    const field = element.querySelector("label")!;
    const input = element.querySelector("input")!;
    expect([...field.classList]).toEqual(["search-field", "menu-search"]);
    expect(input.className).toBe("");
    expect(input.getAttribute("aria-label")).toBe("Search commands");
    app.unmount();
  });
});
