import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

// A form: put in from the block picker, laid out as its template says (the
// photo beside the ingredients), filled in with Tab from field to field and
// through its table, selected with Escape, and saved with its definition.

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-forms-")),
  "forms.md",
);

// the text of each field of the first form, in lower case: autocorrect
// capitalizes the first word of a line
const fields = () =>
  browser.execute(() =>
    [...document.querySelectorAll("#editor section.form .field")].map(
      (field) => [
        field.getAttribute("data-blank-field"),
        field.textContent?.toLowerCase(),
      ],
    ),
  );

// a 240 x 160 picture
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAABRElEQVR42u3SQREAMAjAsDFdCEMislDBh0sk9Bpd+eCKLwGGBkODocHQGBoMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2GxtBgaDA0GBoMjaHB0GBoMDQYGkODocHQYGgwNIYGQ4OhwdAYGgwNhgZDg6ExNBgaDA2GBkNjaDA0GBoMDYbG0GBoMDQYGgyNocHQYGgwNBgaQ4OhwdBgaDA0hgZDg6HB0GBoDA2GBkODoTE0GBoMDYYGQ2NoMDQYGgwNhsbQYGgwNBgaDI2hwdBgaDA0GBpDg6HB0GBoMDSGBkODocHQYGgMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2GxtBgaDA0GBoMjaHB0GBoMDQYGkODocHQYGgwNIYGQ4OhwdBgaAwNhgZDg6HB0BgaDA2GBkNjaDA0GBoMDYbG0GBoMDTsGIF8ArxK0RTtAAAAAElFTkSuQmCC",
  "base64",
);

// where the caret at the end of the first match of `selector` is on the
// screen
const caretAt = (selector: string) =>
  browser.execute((selector: string) => {
    const geometry = (
      window as unknown as {
        blankGeometry: {
          endOf: (element: Element) => number;
          caretBox: (pos: number) => { left: number; top: number } | null;
        };
      }
    ).blankGeometry;
    const element = document.querySelector(selector);
    return element && geometry.caretBox(geometry.endOf(element));
  }, selector);

describe("a form", () => {
  before(async () => {
    fs.writeFileSync(file, "the cookbook.\n");
    fs.writeFileSync(path.join(path.dirname(file), "photo.png"), PHOTO);
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("is put in from the blocks pane, selected", async () => {
    await clickInto("#editor p");
    await pressMod(Key.Alt, "b");
    await expect(
      $('#blocks-pane .tile[data-block="blank/recipe"]'),
    ).toBeExisting();
    await type("recipe");
    await type(Key.ArrowDown);
    await expect(
      $('#blocks-pane .tile[data-block="blank/recipe"]'),
    ).toBeFocused();
    await type(Key.Enter);
    await expect(
      $("#editor section.form.ProseMirror-selectednode"),
    ).toBeExisting();
    await expect($("#ui-announcement")).toHaveText("Recipe inserted");
    // the shortcut twice: the pane takes the focus, then closes
    await pressMod(Key.Alt, "b");
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane")).not.toBeExisting();
    expect((await fields()).map(([name]) => name)).toEqual([
      "title",
      "photo",
      "ingredients",
      "steps",
    ]);
  });

  it("shows the photo beside the ingredients", async () => {
    const photo = await caretAt('#editor [data-blank-field="photo"] p');
    const ingredients = await caretAt(
      '#editor [data-blank-field="ingredients"] th',
    );
    const steps = await caretAt('#editor [data-blank-field="steps"] p');
    if (!photo || !ingredients || !steps) throw new Error("not on the pages");
    // side by side, from the same top; the steps below, across the page
    expect(ingredients.left).toBeGreaterThan(photo.left + 100);
    expect(Math.abs(ingredients.top - photo.top)).toBeLessThan(20);
    expect(steps.top).toBeGreaterThan(ingredients.top);
    expect(Math.abs(steps.left - photo.left)).toBeLessThan(2);
  });

  it("is filled in with Tab from field to field", async () => {
    // Enter on the selected form goes into its first field
    await type(Key.Enter);
    await type("pancakes");
    await type(Key.Tab);
    // past the photo, into the table under its header
    await type(Key.Tab);
    await type("200 g");
    await type(Key.Tab);
    await type("flour");
    await type(Key.Tab);
    await type("mix it all");
    const filled = await fields();
    expect(filled[0]).toEqual(["title", "pancakes"]);
    expect(filled[2][1]).toBe("amountingredient200 gflour");
    expect(filled[3]).toEqual(["steps", "mix it all"]);
  });

  it("is selected as a whole with Escape", async () => {
    await type(Key.Escape);
    await expect(
      $("#editor section.form.ProseMirror-selectednode"),
    ).toBeExisting();
  });

  it("is saved with its definition, and back after a restart", async () => {
    await type(Key.ArrowDown);
    await pressMod("s");
    await browser.waitUntil(
      () =>
        fs.readFileSync(file, "utf8").includes("<!-- /blank:definitions -->"),
      { timeoutMsg: `not saved: ${fs.readFileSync(file, "utf8")}` },
    );
    const saved = fs.readFileSync(file, "utf8");
    expect(saved).toContain('<!-- blank:form@1 def="blank/recipe@2#');
    expect(saved).toContain("| 200 g");
    await restartApp([file]);
    await expect($("#editor section.form")).toBeExisting();
    expect((await fields())[3]).toEqual(["steps", "mix it all"]);
  });

  it("takes a photo from the dialog its empty box opens, beside the ingredients", async () => {
    // a hand over its box
    const box = await caretAt('#editor [data-blank-field="photo"] p');
    if (!box) throw new Error("the photo's box isn't on the pages");
    await browser
      .action("pointer")
      .move({
        x: Math.round(box.left + 40),
        y: Math.round(box.top + 40),
        origin: "viewport",
      })
      .perform();
    await expect($("#page-view")).toHaveElementClass("on-picture");
    await clickInto('#editor [data-blank-field="photo"] p');
    await expect($("#image-dialog")).toBeExisting();
    await type("photo.png");
    await type(Key.Enter);
    await expect($("#image-dialog")).not.toBeExisting();
    await expect($('#editor [data-blank-field="photo"] img')).toBeExisting();
    // the ingredients stay beside it, from the same top
    await browser.waitUntil(
      async () => {
        const photo = await caretAt('#editor [data-blank-field="photo"] p');
        const table = await caretAt(
          '#editor [data-blank-field="ingredients"] th',
        );
        return (
          !!photo &&
          !!table &&
          table.left > photo.left + 100 &&
          Math.abs(table.top - photo.top) < 20
        );
      },
      { timeoutMsg: "the ingredients went below the photo" },
    );
  });

  it("is removed from its toolbar", async () => {
    await clickInto('#editor [data-blank-field="title"] h1');
    await $('#block-toolbar [data-id="block-remove"]').click();
    await expect($("#editor section.form")).not.toBeExisting();
    await expect($("#block-toolbar")).not.toBeExisting();
  });
});
