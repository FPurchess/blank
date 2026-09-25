import { $, expect } from "@wdio/globals";

describe("launch", () => {
  it("shows the welcome document", async () => {
    await expect($(".ProseMirror h1")).toHaveText("Welcome to Blank");
  });

  it("shows an untitled document", async () => {
    await expect($("#ui-top")).toHaveText("» Untitled");
  });

  it("counts words and chars", async () => {
    await expect($("#ui-bottom")).toHaveText(/^[1-9]\d* words \d+ chars$/);
  });

  it("uses the default theme", async () => {
    await expect($("body")).toHaveAttribute("data-theme", "light");
  });
});
