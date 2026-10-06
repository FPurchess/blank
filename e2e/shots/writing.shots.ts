// the pictures of docs/guide/writing.md, spelling.md and autocorrect.md, and
// the demo on the home page (see shots.ts)
import { $, browser } from "@wdio/globals";

import {
  editorText,
  Key,
  pressMod,
  pressShift,
  textBox,
  type,
} from "../helpers.ts";
import {
  DEMO,
  SHIFT,
  filmNew,
  finishShots,
  newDocument,
  prepare,
  shot,
} from "./shots.ts";

describe("docs shots: writing", () => {
  before(() => prepare({ withSample: true, view: "pages" }));
  after(() => finishShots());

  // the top of the writing guide: markdown turns into formatting as it's
  // typed, autocorrect sets the punctuation, and the toolbar follows along
  it("records writing", async () => {
    const film = await filmNew({ view: "pages" });
    film.hidePointer();
    await film.type("# Notes from the lighthouse");
    await film.enter(0.8);
    await film.type(
      'the keeper said "the light must never go out" -- and it never did.',
    );
    await film.pause(0.8);
    await film.enter(0.4);
    await film.type("it is **slow** work, and *quiet* work:");
    await film.pause(0.6);
    await film.enter(0.4);
    await film.type("- oil for the lamp");
    await film.enter(0.3);
    await film.type("a log of every ship");
    await film.enter(0.3);
    await film.type("a window to the sea");
    await film.enter(0.3);
    await film.enter(0.5);
    await film.type("> the sea is never the same twice.");
    await film.pause(2.5);
    film.save("writing.gif");
  });

  // the lists of the writing guide: Tab takes an item in, Shift+Tab out,
  // Backspace deletes an empty one, and Enter on an empty one ends the list
  it("records writing a list", async () => {
    const film = await filmNew({ view: "pages" });
    film.hidePointer();
    await film.type("- apples");
    await film.enter(0.5);
    await film.press("Tab", Key.Tab, 0.6);
    await film.type("green ones");
    await film.enter(0.5);
    await film.shortcut(["Shift", "Tab"], () => pressShift(Key.Tab), 0.8);
    await film.type("pears");
    await film.enter(0.5);
    await film.type("plums");
    await film.pause(0.6);
    // the last item taken back: its letters, then Backspace on the empty
    // item deletes it, and the cursor is back after "pears"
    await film.erase(5);
    await film.press("Backspace", Key.Backspace, 0.8);
    await film.enter(0.5);
    await film.press("Enter", Key.Enter, 0.8);
    await film.type("that's all.");
    await film.pause(2.5);
    film.save("lists.gif", 335 + SHIFT);
  });

  it("captures the language chooser", async () => {
    await pressMod(Key.Alt, "l");
    await shot("language");
    await type(Key.Escape);
  });

  it("captures the formatting toolbar", async () => {
    await newDocument({ view: "pages" });
    await type("a centered heading");
    await pressMod("1");
    await pressMod(Key.Shift, "e");
    await type(Key.Enter);
    await type("the toolbar shows how the text at the caret is set.");
    await shot("toolbar");
  });

  it("captures spell check", async () => {
    await newDocument();
    await pressMod(Key.Alt, "s");
    await expect($("#ui-spellcheck")).toHaveText("Spelling");
    await type("every story begins with a blank page and a singel idea.");
    await browser.waitUntil(async () =>
      (await editorText("#editor .spelling-error")).includes("singel"),
    );
    // at the end of the word, so the menu leaves it visible
    const word = await textBox("singel", 5);
    await browser
      .action("pointer")
      .move({
        x: Math.round(word.left),
        y: Math.round((word.top + word.bottom) / 2),
        origin: "viewport",
      })
      .down({ button: 2 })
      .up({ button: 2 })
      .perform();
    await $(`[data-id^="suggestion:"]`).waitForExist();
    await shot("spelling");

    await type(Key.Escape);
    await pressMod(Key.Alt, "s");
  });

  it("records the status bar", async () => {
    const film = await filmNew();
    await film.type("The lighthouse keeper wrote every evening.");
    await film.enter(0.3);
    await film.type("He counted the ships, and the words.");
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.6);
    await film.type("The next page starts here.");
    await film.pause(0.6);
    // the details of the word count, after resting on it
    await film.restOn($("#ui-stats"), $("#word-count-card"), 2.4);
    // the view, by mouse and by keys
    await film.clickOn($("#ui-view"), 1.6, 0.8);
    await expect($("#word-count-card")).not.toExist();
    await film.clickOn($("#ui-view"), 1.2, 0.3);
    // back into the text, away from the hints near the bar
    await film.moveTo({ x: 400, y: 300 }, 0.5);
    film.hidePointer();
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.6);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1);
    film.save("status-bar.gif");
  });

  it("records focus mode", async () => {
    const film = await filmNew({ view: "pages" });
    film.hidePointer();
    await film.shortcut(
      ["Mod", "Shift", "F"],
      () => pressMod(Key.Shift, "f"),
      1,
    );
    // the bars fade slowly as soon as the writing starts
    await film.type("The tabs, the toolbar and the status bar fade");
    await film.type(" while you write, and the page stays where it is.");
    await film.pause(2);
    // a reach for the mouse brings them back at once
    await film.moveTo({ x: 440, y: 330 }, 1.2);
    await film.hold(1.4);
    film.hidePointer();
    await film.shortcut(["Esc"], () => type(Key.Escape), 1.2);
    film.save("focus-mode.gif");
  });

  it("records the writing demo", async () => {
    const film = await filmNew({ view: "pages" });
    film.hidePointer();
    // an empty page and a blinking cursor, then a writer finding their way in.
    // autocorrect does the rest: headings, quotes, dashes, apostrophes and capitals
    await film.pause(0.8);
    await film.type("# A great start");
    await film.enter(0.9);
    await film.type(
      'every story begins the same way: a blank page, a blinking cursor and a quiet "what if?"',
    );
    await film.pause(1.2);
    await film.enter();
    await film.type(
      "you write one word, then another. the room goes quiet -- and for a moment, everything is uncertain",
    );
    await film.pause(1.2);
    await film.erase("uncertain".length);
    await film.pause(0.6);
    await film.type("possible.");
    await film.pause(1.2);
    await film.enter();
    await film.type("that's the joy of it: ");
    await film.shortcut(["Mod", "I"], () => pressMod("i"));
    await film.type("nothing between you and your words.");
    await film.shortcut(["Mod", "I"], () => pressMod("i"), 0.6);
    await film.pause(1.2);
    // and focus mode: the bars fade as the writing goes on
    await film.shortcut(
      ["Mod", "Shift", "F"],
      () => pressMod(Key.Shift, "f"),
      1,
    );
    await film.enter(0.4);
    await film.type("everything else can wait.");
    await film.pause(3);
    // out of focus mode again, so the scenes after it start with the bars
    await type(Key.Escape);
    film.save("demo.gif", DEMO);
  });
});
