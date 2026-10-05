import { describe, expect, it } from "vitest";

import { compileMain } from "./compiled";

// The global rules of _controls.scss, as the app gets them. They come before
// main.scss's own rules, which override them where they say more.

describe("the controls' global rules", () => {
  it("show the hand on everything that acts on a click", async () => {
    const css = await compileMain();
    const pointer = /([^{}]*)\{cursor:pointer\}/.exec(css)![1].split(",");
    for (const selector of [
      "button",
      "a[href]",
      "[role=button]",
      "[role=tab]",
      "[role=menuitem]",
      "[role=menuitemcheckbox]",
      "[role=menuitemradio]",
      "[role=option]",
      "[role=radio]",
      "[role=switch]",
    ]) {
      expect(pointer).toContain(selector);
    }
    // the arrow on what's disabled wins, coming after
    expect(
      css.indexOf(":disabled,[aria-disabled=true]{cursor:default}"),
    ).toBeGreaterThan(css.indexOf("{cursor:pointer}"));
  });

  it("leave the editors without the focus ring", async () => {
    const css = await compileMain();
    // the same weight, so the editor's rule must come later
    expect(css.search(/\.ProseMirror\{[^}]*outline:none/)).toBeGreaterThan(
      css.indexOf(":focus-visible{outline:2px solid var(--focus)"),
    );
  });

  it("set the chrome's text at 13/20, never off the document's root size", async () => {
    const css = await compileMain();
    const rule = (selector: string) =>
      new RegExp(
        `(^|\\})${selector.replace(/[.#[\]=]/g, "\\$&")}\\{([^}]*)\\}`,
      ).exec(css)?.[2] ?? "";
    for (const root of [
      "#ui-top",
      "#outline",
      "#blocks-pane",
      ".context-menu",
      ".toc-popover",
      ".toolbar",
      ".table-picker",
    ]) {
      expect(rule(root), root).toContain(
        "font-size:var(--ui);line-height:20px",
      );
      expect(rule(root), root).not.toMatch(/font-size:[\d.]+rem/);
    }
  });

  it("set a side pane's head as the draft has it, not as a document heading", async () => {
    const css = await compileMain();
    // the title is an h2, which the document's heading rule would size
    expect(css).toMatch(
      /\.side-pane-title\{margin:0;font:inherit;font-weight:500;letter-spacing:normal\}/,
    );
    expect(css).toMatch(
      /\.side-pane-head\{[^}]*gap:var\(--s1\);padding:var\(--s2\) var\(--s2\) var\(--s2\) var\(--s3\)\}/,
    );
  });
});
