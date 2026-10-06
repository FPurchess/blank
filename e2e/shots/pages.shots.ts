// the pictures of docs/guide/pages.md and docs/guide/themes.md, and the
// themes on the home page (see shots.ts)
import { $, browser } from "@wdio/globals";

import { Key, paste, pressMod, type } from "../helpers.ts";
import {
  filmNew,
  finishShots,
  newDocument,
  prepare,
  setTheme,
  setView,
  shot,
} from "./shots.ts";

const themes = ["light", "dark", "black", "red", "green", "blue"];

describe("docs shots: pages and themes", () => {
  before(() => prepare({ withSample: true, view: "pages" }));
  after(() => finishShots());

  it("captures every theme", async () => {
    for (const theme of themes) {
      await setTheme(theme);
      await shot(`theme-${theme}`, { dark: false });
    }
    await setTheme("light");
  });

  it("captures the page setup", async () => {
    await setView("pages");
    await pressMod(Key.Alt, "u");
    await $("#page-setup").waitForDisplayed();
    // landscape, with the picture turned
    await browser.keys(Key.ArrowDown);
    await browser.keys(Key.ArrowRight);
    await shot("page-setup");
    await type(Key.Escape);
  });

  // in page ends, where both pages show beside the break's mark
  it("captures a page break", async () => {
    await newDocument();
    await type("the end of the first chapter.");
    await pressMod(Key.Enter);
    await type("the second chapter starts on a new page.");
    await shot("page-break");
  });

  it("records adding page numbers and a header", async () => {
    const film = await filmNew({ bands: false });
    await film.type("# The Lighthouse");
    await film.enter(0.4);
    await film.type("It was a dark and stormy night.");
    await film.pause(0.6);

    // page numbers in one click, from the hint at the bottom edge
    await film.hover("bottom");
    await film.clickOn($("#band-footer").$("button=# Page numbers"), 1.2);
    await film.clickOn($("#band-editor").$("button=Done"), 1);

    // the header: the chapter on the left, the page on the right
    await film.shortcut(["Mod", "Alt", "H"], () => pressMod(Key.Alt, "h"), 1);
    await film.clickOn($("#band-editor .slot.left .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=Chapter"), 0.8);
    await film.clickOn($("#band-editor .slot.right .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=# Page number ▾"), 1);
    await film.clickOn(
      $("#context-menu").$('[data-id="Page {page} of {pages}"]'),
      1,
    );
    // a title page without them
    await film.clickOn($("#band-editor").$("button=First Page ▾"), 1);
    await film.clickOn(
      $("#context-menu").$('[data-id="first-page:plain"]'),
      0.8,
    );
    await film.clickOn($("#band-editor").$("button=Done"), 0.6);
    await film.clickInto("#editor p", 0.3);
    film.hidePointer();
    // a second page, whose header shows where the first page ends
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("The next morning, the sea was calm.");
    await film.pause(2.5);
    film.save("header-footer.gif");
  });

  it("records different even pages", async () => {
    const film = await filmNew({ bands: false });
    await film.type("# The Lighthouse");
    await film.enter(0.4);
    await film.type("It was a dark and stormy night.");
    await film.shortcut(["Mod", "Alt", "F"], () => pressMod(Key.Alt, "f"), 0.8);
    await film.clickOn($("#band-editor").$("button=Title"), 0.6);
    await film.clickOn($("#band-editor .slot.right .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=# Page number ▾"), 0.8);
    await film.clickOn($("#context-menu").$('[data-id="{page}"]'), 0.8);
    // the even pages start mirrored: the page number on the outside
    await film.clickOn($("#band-editor").$("button=Odd & Even Pages"), 1.6);
    await film.clickOn($("#band-editor").$("button=Odd Pages"), 1.2);
    await film.clickOn($("#band-editor").$("button=Even Pages"), 1.2);
    await film.clickOn($("#band-editor").$("button=Done"), 0.6);
    await film.clickInto("#editor p", 0.3);
    film.hidePointer();
    // an even page, whose own header shows where the first page ends
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("The next morning, the sea was calm.");
    await film.pause(2);
    film.save("even-pages.gif");
  });

  it("records switching between page ends and pages", async () => {
    const film = await filmNew();
    await film.type("The lighthouse keeper wrote every evening.");
    await film.enter(0.4);
    await film.type("The first page ends here.");
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("And the next one starts.");
    await film.pause(0.8);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.8);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.6);
    await film.pause(1);
    film.save("page-views.gif");
  });

  it("records the outline", async () => {
    const film = await filmNew({ view: "pages" });
    const story = [
      ["h1", "The lighthouse"],
      ["h2", "The keeper"],
      ["h2", "The lamp"],
      ["h1", "The storm"],
      ["h2", "The night"],
      ["h2", "The ship"],
      ["h1", "The morning"],
    ]
      .map(
        ([tag, title]) =>
          `<${tag}>${title}</${tag}>` +
          "<p>The keeper climbed the stairs every evening, lit the lamp and wrote down the weather, the ships and the wind.</p>".repeat(
            4,
          ),
      )
      .join("");
    await paste({ "text/html": story });
    await browser.execute(() => {
      document.querySelector("#page-view")!.scrollTop = 0;
    });
    await film.pause(1);
    const centre = (selector: string, text?: string) =>
      browser.execute(
        (selector, text) => {
          const element = [...document.querySelectorAll(selector)].find(
            (found) => !text || found.textContent?.trim() === text,
          )!;
          const box = element.getBoundingClientRect();
          return {
            x: Math.round(box.left + box.width / 2),
            y: Math.round(box.top + box.height / 2),
          };
        },
        selector,
        text,
      );
    // pointing at the dashes shows the headings, a click scrolls to one
    await film.moveTo(await centre(".outline-dashes"), 1);
    await film.pause(1.2);
    // the list closes when the pointer is off the dashes and the list for a
    // moment (PEEK_GRACE in src/ui/DocumentOutline.vue), which the frames of
    // a slow move across the gap between them can take: in one step onto the
    // list (both steps of the move land on it), which looks like a quick flick
    const entry = await centre(".outline-entry", "The storm");
    const listRight = await browser.execute(
      () =>
        document.querySelector(".outline-list")!.getBoundingClientRect().right,
    );
    await film.moveTo({ x: Math.round(listRight - 60), y: entry.y }, 0.06);
    await film.moveTo(entry, 0.7);
    await film.click(1.6);
    // away again, and the list goes with the pointer: onto the text above
    // "The storm", not the header of its page below it, which a hover marks
    await film.moveTo({ x: 400, y: 200 }, 0.6);
    film.hidePointer();
    await film.pause(0.6);
    // the shortcut opens it and puts it away
    await film.shortcut(["Mod", "Alt", "O"], () => pressMod(Key.Alt, "o"), 1.8);
    await film.shortcut(["Mod", "Alt", "O"], () => pressMod(Key.Alt, "o"), 1);
    await film.pause(0.6);
    film.save("outline.gif");
  });
});
