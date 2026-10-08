// the pictures of docs/guide/menu.md and docs/guide/find.md, and of the zoom
// in docs/guide/pages.md (see shots.ts)
import { $, browser } from "@wdio/globals";

import { Key, pressMod, type } from "../helpers.ts";
import { filmNew, finishShots, prepare, shot } from "./shots.ts";

const menu = () => $("#main-menu");

describe("docs shots: the main menu, find and zoom", () => {
  before(() => prepare({ withSample: true, view: "pages" }));
  // a scene that failed leaves the next ones the window as it should be
  afterEach(async () => {
    for (const open of ["#main-menu", "#find-panel"]) {
      while (await $(open).isExisting()) {
        await type(Key.Escape);
        await browser.pause(200);
      }
    }
  });
  after(() => finishShots());

  // over the sample, the menu as the logo opens it
  it("captures the main menu", async () => {
    await $(".logo-button").click();
    await menu().waitForDisplayed();
    await shot("main-menu");
  });

  it("records the main menu's search", async () => {
    const film = await filmNew({ view: "pages" });
    await film.shortcut(["Mod", "K"], async () => {
      await pressMod("k");
      await menu().waitForDisplayed();
    });
    await film.type("pages");
    await film.pause(1);
    await film.press("Enter", Key.Enter, 1.6);
    film.save("main-menu-search.gif");
    // back to the sheets, as the other pictures have them
    await pressMod(Key.Alt, "v");
  });

  it("records find and replace", async () => {
    const film = await filmNew({ view: "pages" });
    await film.type(
      "The chrome of a window is its frame. Less chrome, more text.",
    );
    await film.shortcut(["Mod", "F"], async () => {
      await pressMod("f");
      await $("#find-panel").waitForDisplayed();
    });
    await film.type("chrome");
    await film.pause(1);
    await film.press("Enter", Key.Enter, 1);
    await film.clickOn($('#find-panel [aria-label="Replace with"]'), 0.4);
    film.hidePointer();
    await film.type("color");
    await film.clickOn(
      $('//div[@id="find-panel"]//button[normalize-space()="Replace all"]'),
      1.6,
    );
    await film.press("Esc", Key.Escape, 1);
    film.save("find.gif");
  });

  it("records the zoom", async () => {
    const film = await filmNew({ view: "pages" });
    await film.type("zoom shows the pages larger or smaller.");
    await film.clickOn($("#ui-zoom-in"), 0.8);
    await film.clickOn($("#ui-zoom-in"), 0.8);
    await film.clickOn($("#ui-zoom-out"), 0.8);
    await film.clickOn($("#ui-zoom"), 1.2);
    await film.shortcut(["Mod", "="], () => pressMod("="), 1);
    await film.shortcut(["Mod", "-"], () => pressMod("-"), 1);
    await film.clickOn($("#ui-zoom"), 1.2);
    film.save("zoom.gif");
  });
});
