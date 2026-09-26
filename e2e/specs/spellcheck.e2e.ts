import { $, $$, browser, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, restartApp, type } from "../helpers.ts";

const errors = () => $$(".ProseMirror .spelling-error");
const menu = () => $("#context-menu");
const item = (label: string) =>
  $(`//*[@role="menuitem"][.//*[@class="label" and text()="${label}"]]`);
const status = () => $("#ui-spellcheck");

const flagged = async () =>
  (await errors().map((element) => element.getText())).join(" ");

/**
 * expectFlagged waits until exactly the words in `expected` are flagged
 */
const expectFlagged = async (expected: string) => {
  let last = "";
  await browser
    .waitUntil(async () => (last = await flagged()) === expected)
    .catch(() => {
      throw new Error(`flagged "${last}" instead of "${expected}"`);
    });
};

/**
 * rightClick opens the context menu on the misspelled word `word`
 */
const rightClick = async (word: string) => {
  const target = await $(
    `//*[contains(@class, "spelling-error")][text()="${word}"]`,
  );
  await target.click({ button: "right" });
  await expect(menu()).toBeDisplayed();
};

/**
 * contextMenuOn opens the context menu on the first occurrence of `word` in
 * the editor, whether it is flagged or not, or in the first paragraph for ""
 */
const contextMenuOn = async (word: string) => {
  await browser.execute((word: string) => {
    const editor = document.querySelector(".ProseMirror")!;
    const open = (x: number, y: number) => {
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
      };
      const target = document.elementFromPoint(x, y)!;
      target.dispatchEvent(new MouseEvent("mousedown", init));
      target.dispatchEvent(new MouseEvent("contextmenu", init));
    };
    if (!word) {
      const rect = editor.querySelector("p")!.getBoundingClientRect();
      return open(rect.left + 2, rect.top + rect.height / 2);
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent!.indexOf(word);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const rect = range.getBoundingClientRect();
      return open(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    throw new Error(`${word} isn't in the editor`);
  }, word);
  await expect(menu()).toBeDisplayed();
};

describe("spell check", () => {
  before(async () => {
    await focusEditor();
    await pressMod("n");
    // the system language may be another one. Words are typed in lowercase,
    // since WebKitWebDriver doesn't type capitals.
    await pressMod(Key.Alt, "l");
    await type("en");
    await type(Key.Enter);
  });

  it("is off by default", async () => {
    await type("Thiss is wrng ");

    await expect(status()).not.toBeDisplayed();
    await expect(errors()).toBeElementsArrayOfSize(0);
  });

  it("flags misspelled words once turned on", async () => {
    await pressMod(Key.Alt, "s");

    await expect(status()).toHaveText("Spelling ✓");
    await expectFlagged("Thiss wrng");
  });

  it("doesn't flag a word while it is typed", async () => {
    await type("anothr");
    await browser.pause(500);
    expect(await flagged()).toBe("Thiss wrng");

    await type(" ");
    await expectFlagged("Thiss wrng anothr");
  });

  it("replaces a word with a suggestion and undoes it", async () => {
    await rightClick("wrng");
    await item("wrong").click();

    await expect(menu()).not.toBeExisting();
    await expect($(".ProseMirror p")).toHaveText("Thiss is wrong anothr");

    await pressMod("z");
    await expect($(".ProseMirror p")).toHaveText("Thiss is wrng anothr");
  });

  it("adds a word to the dictionary, which lasts", async () => {
    await rightClick("Thiss");
    await item("Add to Dictionary").click();

    await expectFlagged("wrng anothr");

    // the document is saved a second after the last change
    await browser.pause(2000);
    await restartApp();
    await expect(status()).toHaveText("Spelling ✓");
    await expectFlagged("wrng anothr");
  });

  it("removes a word from the dictionary", async () => {
    await contextMenuOn("Thiss");
    await item("Remove from Dictionary").click();

    await expectFlagged("Thiss wrng anothr");
  });

  it("edits a word in the dictionary", async () => {
    await rightClick("Thiss");
    await item("Add to Dictionary").click();
    await expectFlagged("wrng anothr");

    await contextMenuOn("Thiss");
    await item("Edit in Dictionary…").click();
    const input = await $("#context-menu input");
    await expect(input).toHaveValue("Thiss");
    // the word is selected, so typing replaces it
    await type("anothr");
    await type(Key.Enter);

    await expect(menu()).not.toBeExisting();
    await expectFlagged("Thiss wrng");
  });

  it("jumps to the next misspelling and opens its menu", async () => {
    await focusEditor();
    await pressMod(Key.Alt, "n");

    await expect(menu()).toBeDisplayed();
    await type(Key.Escape);
    await expect(menu()).not.toBeExisting();

    // the editor has the focus again
    await type(Key.ArrowRight);
    await type("x");
    await expect($(".ProseMirror p")).toHaveText(/x/);
    await pressMod("z");
  });

  it("opens the menu at the cursor with Shift+F10", async () => {
    await browser.keys([Key.Shift, Key.F10]);

    await expect(menu()).toBeDisplayed();
    await expect(item("Select All")).toBeDisplayed();
    await type(Key.Escape);
  });

  it("ignores all occurrences until a new document", async () => {
    await pressMod("n");
    await type("wrng and wrng ");
    await expectFlagged("Wrng wrng");

    await rightClick("wrng");
    await item("Ignore All").click();
    await expectFlagged("");

    await pressMod("n");
    await type("wrng ");
    await expectFlagged("Wrng");
  });

  it("checks the chosen language", async () => {
    await pressMod(Key.Alt, "l");
    await type("de");
    await type(Key.Enter);
    await type("und unnd ");

    await expect($("#ui-language")).toHaveText("DE");
    await expectFlagged("Wrng unnd");
  });

  it("cuts, copies and pastes from the menu", async () => {
    await contextMenuOn("und");
    await item("Select All").click();
    await contextMenuOn("und");
    await item("Copy").click();

    await pressMod("n");
    await contextMenuOn("");
    await item("Paste").click();

    await expect($(".ProseMirror p")).toHaveText("Wrng und unnd");
  });

  it("turns off from the menu", async () => {
    await rightClick("unnd");
    await item("Disable Spell Check").click();

    await expect(status()).not.toBeDisplayed();
    await expect(errors()).toBeElementsArrayOfSize(0);
  });
});
