import { browser, $, expect } from "@wdio/globals";

import { clickText, editorText, Key, type } from "../helpers.ts";

// Composing with an input method. Under xvfb there is no ibus engine that
// composes, but GTK's own input method, which WebKitGTK falls back to,
// composes a character by its code after Ctrl+Shift+U. WebKitWebDriver only
// hands the webview the end of the composition, so what shows while
// composing (the underline, the candidate window) can't be checked here.

describe("input methods", () => {
  it("composes a character where the pages were clicked", async () => {
    await expect($("#page-view .page-canvas")).toBeExisting();
    await browser.execute(() => {
      const events: string[] = [];
      Object.assign(window, { compositions: events });
      document
        .querySelector("#editor")!
        .addEventListener("compositionend", (event) =>
          events.push((event as CompositionEvent).data),
        );
    });
    // before "Blank" in the heading of the welcome document
    await clickText("Blank");
    await browser.keys([Key.Ctrl, Key.Shift, "u"]);
    await type("e9");
    await browser.keys(Key.Space);

    // some input stacks end an empty composition first, e.g. on CI
    await expect(
      browser.execute(() =>
        (window as unknown as { compositions: string[] }).compositions.filter(
          (data) => data !== "",
        ),
      ),
    ).resolves.toEqual(["é"]);
    await expect(editorText("#editor h1")).resolves.toEqual([
      "Welcome to éBlank",
    ]);
  });
});

// Screen readers read the editor behind the pages: it keeps the focus and
// the text in the order of the document, while what is painted is hidden
// from them. Orca itself can't run here, so this checks what it reads.
describe("screen readers", () => {
  it("read the focused editor, not the painted pages", async () => {
    const tree = await browser.execute(() => {
      const editor = document.querySelector<HTMLElement>("#editor")!;
      const hidden = (element: Element | null): boolean =>
        !!element &&
        (element.getAttribute("aria-hidden") === "true" ||
          hidden(element.parentElement));
      const style = getComputedStyle(editor);
      return {
        focused: document.activeElement === editor,
        editable: editor.isContentEditable,
        hidden: hidden(editor),
        shown: style.display !== "none" && style.visibility !== "hidden",
        pages: document
          .querySelector("#page-view")!
          .getAttribute("aria-hidden"),
        canvases: [...document.querySelectorAll("canvas")].every(
          (canvas) => canvas.getAttribute("aria-hidden") === "true",
        ),
        // the blocks in the order of the document
        first: editor.firstElementChild?.tagName,
      };
    });
    expect(tree).toEqual({
      focused: true,
      editable: true,
      hidden: false,
      shown: true,
      pages: "true",
      canvases: true,
      first: "H1",
    });
  });
});
