/**
 * @vitest-environment jsdom
 */
import { assert, describe, expect, it, vi, beforeEach } from "vitest";

import { bootUI } from "../src/ui";
import { path, textContent } from "../src/state";

beforeEach(() => {
  expect(window).toBeDefined();

  document.body.innerHTML = "";

  const uiTop = document.createElement("div");
  uiTop.id = "ui-top";
  document.body.appendChild(uiTop);

  const uiBottom = document.createElement("div");
  uiBottom.id = "ui-bottom";
  document.body.appendChild(uiBottom);
});

describe("ui", () => {
  it("updates the file path display", () => {
    const uiTop = document.querySelector<HTMLElement>("#ui-top");
    assert.isEmpty(uiTop.innerHTML);

    bootUI();

    assert.equal(uiTop.innerHTML, "» Untitled");

    path.value = "/this/is/a/test/path";

    assert.equal(uiTop.innerHTML, `» ${path.value}`);
  });

  it("updates the word and char count", () => {
    const uiBottom = document.querySelector<HTMLElement>("#ui-bottom");
    assert.isEmpty(uiBottom.innerHTML);

    bootUI();

    assert.equal(uiBottom.innerHTML, "0 words 0 chars");

    textContent.value = "one two three four";
    const charCount = textContent.value.length;
    const wordCount = textContent.value.split(/\s/).length;

    assert.equal(uiBottom.innerHTML, `${wordCount} words ${charCount} chars`);
  });
});
