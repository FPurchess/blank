// the pictures of docs/guide/settings.md: the dialog, and a recording of
// each of its sections but About (see shots.ts)
import { $, $$, browser } from "@wdio/globals";

import { editorText, focusEditor, Key, pressMod, type } from "../helpers.ts";
import { filmNew, finishShots, prepare, type Recorder, shot } from "./shots.ts";

const dialog = () => $("#settings-dialog");
const row = (name: string) => $(`#settings-panel [data-row="${name}"]`);
const underlined = async () => editorText("#editor .spelling-error");

/** opens the settings with their shortcut, on `section` if given */
const open = async (film: Recorder, section?: string) => {
  await film.shortcut(
    ["Mod", ","],
    async () => {
      await focusEditor();
      await pressMod(",");
      await dialog().waitForDisplayed();
    },
    1,
  );
  if (section) await film.clickOn($(`#settings-tab-${section}`), 1);
};

/** closes them with Esc, which first leaves a page within a section */
const close = async (film: Recorder, seconds = 0.8) => {
  film.hidePointer();
  await film.shortcut(
    ["Esc"],
    async () => {
      await type(Key.Escape);
      await dialog().waitForExist({ reverse: true });
    },
    seconds,
  );
};

/** `element` of the settings, scrolled into the panel's view to click it */
const inView = async (element: ReturnType<typeof $>) => {
  await element.scrollIntoView({ block: "center" });
  return element;
};

describe("docs shots: settings", () => {
  before(() => prepare({ withSample: true, view: "pages" }));
  // a scene that failed leaves the next ones the window as it should be
  afterEach(async () => {
    while (await dialog().isExisting()) {
      await type(Key.Escape);
      await browser.pause(200);
    }
  });
  after(() => finishShots());

  // over the sample, with the cursor where prepare put it
  it("captures the settings", async () => {
    await pressMod(",");
    await dialog().waitForDisplayed();
    await shot("settings");
    await type(Key.Escape);
    await dialog().waitForExist({ reverse: true });
  });

  // the themes switch in this one, so it comes only as it is
  it("records the appearance settings", async () => {
    const film = await filmNew({ view: "pages", dark: false });
    await film.type("Every theme colors the pages too.");
    await open(film);
    for (const theme of ["dark", "blue", "light"]) {
      await film.clickOn($(`.theme-card[data-value="${theme}"]`), 1.2);
    }
    // how soon focus mode hides the controls
    await film.clickOn(
      await inView(row("hide-after").$('button[data-value="10"]')),
      1.2,
    );
    await film.clickOn(row("hide-after").$('button[data-value="3"]'), 0.8);
    await close(film);
    film.save("settings-appearance.gif");
  });

  it("records the writing settings", async () => {
    const film = await filmNew({ view: "pages" });
    await open(film, "writing");
    // a switch per group of autocorrect
    const dashes = await inView(row("autocorrect-dashes").$("[role=switch]"));
    await film.clickOn(dashes, 0.8);
    await film.clickOn(dashes, 0.8);
    // a replacement of your own, used at once
    await film.clickOn(await inView(row("replacements").$("button")), 1);
    await expect($("#settings-replace-typed")).toBeFocused();
    film.hidePointer();
    await film.type("btw");
    await film.press("Tab", Key.Tab, 0.4);
    await film.type("by the way");
    await film.press("Enter", Key.Enter, 1.2);
    await film.press("Esc", Key.Escape, 0.6);
    await close(film);
    await film.type("see you soon btw ");
    await film.pause(2);
    film.save("settings-writing.gif");
  });

  it("records the spelling settings", async () => {
    const film = await filmNew({ view: "pages" });
    await open(film, "spelling");
    await film.clickOn(row("spellcheck").$("[role=switch]"), 1);
    await close(film);
    await film.type("A blankword on the page.");
    await browser.waitUntil(async () =>
      (await underlined()).includes("blankword"),
    );
    await film.pause(1.2);
    // a word of your own: the underline goes
    await open(film, "spelling");
    await film.clickOn(await inView(row("dictionary").$("button")), 1);
    await expect($("#settings-dictionary-add")).toBeFocused();
    film.hidePointer();
    await film.type("blankword");
    await film.press("Enter", Key.Enter, 1.2);
    await film.press("Esc", Key.Escape, 0.6);
    await close(film);
    await browser.waitUntil(
      async () => (await $$("#editor .spelling-error").length) === 0,
    );
    await film.pause(2);
    film.save("settings-spelling.gif");
    // spell check off again, as the other pictures have it
    await focusEditor();
    await pressMod(Key.Alt, "s");
  });

  it("records the shortcut settings", async () => {
    const film = await filmNew({ view: "pages" });
    await open(film, "shortcuts");
    await film.clickOn($("#settings-shortcuts-search"), 0.4);
    film.hidePointer();
    await film.type("pdf");
    await film.pause(0.6);
    const key = $('.shortcut[data-command="export.pdf"] .shortcut-key');
    await film.clickOn(key, 1);
    await expect(key).toHaveText("Press keys…");
    await film.shortcut(
      ["Mod", "Shift", "P"],
      () => pressMod(Key.Shift, "p"),
      1.6,
    );
    await expect(key).toHaveText("Ctrl+Shift+P");
    // and back to Blank's own
    await film.clickOn(
      $('.shortcut[data-command="export.pdf"] .reset-key'),
      1.4,
    );
    await expect(key).toHaveText("Ctrl+Alt+P");
    await close(film);
    film.save("settings-shortcuts.gif");
  });
});
