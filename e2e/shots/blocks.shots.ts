// the pictures of docs/guide/blocks.md (see shots.ts)
import { $, browser } from "@wdio/globals";

import { clickInto, Key, paste, pressMod } from "../helpers.ts";
import { filmNew, finishShots, prepare } from "./shots.ts";

describe("docs shots: blocks", () => {
  before(() => prepare());
  after(() => finishShots());

  it("records the blocks pane", async () => {
    const film = await filmNew();
    await film.type("The keeper climbed the stairs every evening.");
    await film.enter(0.3);
    await film.type("He lit the lamp and wrote down the weather.");
    await film.pause(0.6);
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 1.2);
    // a tile dragged between the two paragraphs, the line showing where
    const tile = $('#blocks-pane .tile[data-block="toc"]');
    const { x, y } = await tile.getLocation();
    await film.moveTo({ x: Math.round(x + 40), y: Math.round(y + 30) }, 0.8);
    const second = await browser.execute(() => {
      const geometry = window.blankGeometry;
      const box = geometry.caretBox(geometry.find("He lit"))!;
      return { x: Math.round(box.left + 120), y: Math.round(box.top + 2) };
    });
    await film.drag(second, 1.2, 0.8);
    await film.pause(1.4);
    // a click inserts where the cursor is
    await film.clickOn($('#blocks-pane .tile[data-block="blank/recipe"]'), 1.8);
    film.hidePointer();
    await film.pause(0.6);
    film.save("blocks-pane.gif");
  });

  it("records a table of contents", async () => {
    const film = await filmNew({ view: "pages" });
    // the pane, Enter for its first block, and the pane put away: a table
    // of contents still without headings
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 1.2);
    await film.press("Enter", Key.Enter, 1);
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 0.4);
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 0.8);
    // the story, each chapter on a page of its own: the entries come
    const paragraph =
      "<p>The keeper climbed the stairs every evening, lit the lamp and wrote down the weather, the ships and the wind.</p>";
    const story = [
      ["h1", "The lighthouse"],
      ["h2", "The keeper"],
      ["h2", "The lamp"],
      ["h1", "The storm"],
      ["h2", "The ship"],
      ["h1", "The morning"],
    ]
      .map(
        ([tag, title], index) =>
          (tag === "h1" && index > 0 ? '<hr data-page-break="">' : "") +
          `<${tag}>${title}</${tag}>` +
          paragraph.repeat(2),
      )
      .join("");
    // the inserted block is still selected, and a paste would replace it:
    // the story goes into the empty paragraph below it
    await clickInto("#editor > p:last-child");
    await paste({ "text/html": story });
    await browser.execute(() => {
      document.querySelector("#page-view")!.scrollTop = 0;
    });
    await film.pause(1.6);
    // a heading renamed, and its entry follows
    await film.clickInto("#editor h1", 0.4);
    film.hidePointer();
    await film.type(" at the cape");
    await film.pause(1.4);
    // a click selects it, and the pencil opens its settings: only the
    // headings 1
    const toc = await browser.execute(() => {
      const geometry = window.blankGeometry;
      const block = geometry.topBlocks().find(({ type }) => type === "toc")!;
      const box = geometry.blockBoxes(block.from, block.to)[0];
      return {
        x: Math.round((box.left + box.right) / 2),
        y: Math.round((box.top + box.bottom) / 2),
      };
    });
    await film.moveTo(toc, 0.6);
    await film.click(0.8);
    await film.clickOn($('#block-toolbar [data-id="block-edit"]'), 1);
    film.hidePointer();
    await film.press("↑", Key.ArrowUp, 0.5);
    await film.press("↑", Key.ArrowUp, 1.2);
    await film.press("Esc", Key.Escape, 1.6);
    film.save("toc.gif");
  });

  it("records filling in a form", async () => {
    const film = await filmNew({ view: "pages" });
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 0.8);
    await film.type("recipe");
    await film.press("Enter", Key.Enter, 1);
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 0.4);
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 0.8);
    await film.press("Enter", Key.Enter, 0.6);
    await film.type("Pancakes");
    await film.press("Tab", Key.Tab, 0.6);
    await film.press("Tab", Key.Tab, 0.6);
    await film.type("200 g");
    await film.press("Tab", Key.Tab, 0.4);
    await film.type("flour");
    await film.press("Tab", Key.Tab, 0.6);
    await film.type("Whisk the flour with the milk and the eggs.");
    await film.pause(2.2);
    film.save("form.gif");
  });
});
