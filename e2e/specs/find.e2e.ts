import { $, browser, expect } from "@wdio/globals";

import {
  expectEditorText,
  focusEditor,
  Key,
  pressMod,
  type,
} from "../helpers.ts";

// Find and replace: the panel counts and steps through the matches,
// replaces all of them as one step to undo, and takes regex groups

const panel = () => $("#find-panel");
const field = () => $('#find-panel [aria-label="Find"]');
const count = () => $("#find-panel .count");
const button = (text: string) =>
  $(`//div[@id="find-panel"]//button[normalize-space()="${text}"]`);

/**
 * fill puts `value` into a field of the panel as typing would: the driver
 * doesn't type characters that need Shift, like ( and $
 */
const fill = (label: string, value: string) =>
  browser.execute(
    (label: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(
        `#find-panel [aria-label="${label}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    },
    label,
    value,
  );

describe("find and replace", () => {
  beforeEach(async () => {
    await focusEditor();
    await pressMod("n");
  });

  afterEach(async () => {
    if (await panel().isExisting()) {
      await field().click();
      await type(Key.Escape);
    }
  });

  it("counts, steps, replaces all, and undoes it in one step", async () => {
    await type("the cat and the hat. the end");
    await pressMod("f");
    await expect(field()).toBeFocused();
    await type("the");
    await expect(count()).toHaveText(expect.stringMatching(/ of 3$/));
    await type(Key.Enter);
    await expect(count()).toHaveText(expect.stringMatching(/^\d of 3$/));

    await fill("Replace with", "a");
    await button("Replace all").click();
    await expectEditorText("#editor p", "a cat and a hat. a end");

    await field().click();
    await type(Key.Escape);
    await expect(panel()).not.toExist();
    await pressMod("z");
    // as typed, which autocorrect capitalized
    await expectEditorText("#editor p", "The cat and the hat. The end");
  });

  it("replaces with the groups of a regular expression", async () => {
    await type("ann-home bob-work");
    await pressMod("f");
    await $('#find-panel [aria-label="Regular expression"]').click();
    await fill("Find", "(\\w+)-");
    await expect(count()).toHaveText(expect.stringMatching(/ of 2$/));
    await fill("Replace with", "$1 at ");
    await button("Replace all").click();
    // autocorrect capitalized the sentence
    await expectEditorText("#editor p", "Ann at home bob at work");
    // off again for the next
    await $('#find-panel [aria-label="Regular expression"]').click();
  });
});
