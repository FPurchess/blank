import { execFileSync, spawn } from "node:child_process";

import { browser, expect } from "@wdio/globals";

import {
  editorText,
  focusEditor,
  pressMod,
  textBox,
  type,
} from "../helpers.ts";

// The primary selection of X11 and Wayland: the text selected on the pages
// is the one other apps paste with a middle click, and a middle click on the
// pages pastes theirs. xclip reads and sets it from outside the app.

const hasXclip = (() => {
  try {
    execFileSync("xclip", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    if (process.env.CI)
      throw new Error("the primary selection specs need xclip");
    return false;
  }
})();

const frames = () =>
  browser.executeAsync((done: () => void) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  );

const readPrimary = () =>
  execFileSync("xclip", ["-o", "-selection", "primary"], {
    encoding: "utf8",
    timeout: 2000,
  });

// another app's selection: xclip owns it until something else is selected
const setPrimary = async (text: string) => {
  const owner = spawn("xclip", ["-selection", "primary", "-i"], {
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });
  owner.stdin.end(text);
  owner.unref();
  await browser.waitUntil(() => readPrimary() === text, { timeout: 3000 });
};

// the middle of the `offset`th character of `text` on the pages
const pointAt = async (text: string, offset = 0) => {
  const box = await textBox(text, offset);
  return {
    x: Math.round(box.left + 1),
    y: Math.round((box.top + box.bottom) / 2),
    origin: "viewport" as const,
  };
};

(hasXclip ? describe : describe.skip)("the primary selection", () => {
  beforeEach(async () => {
    await focusEditor();
    await pressMod("a");
    await type("hello world");
    await frames();
  });

  it("is what's selected on the pages", async () => {
    const at = await pointAt("world", 1);
    await browser
      .action("pointer")
      .move(at)
      .down()
      .up()
      .pause(50)
      .down()
      .up()
      .perform();
    await frames();
    await browser.waitUntil(() => readPrimary() === "world", {
      timeout: 3000,
    });
  });

  it("is pasted where the pages are middle-clicked, as plain text", async () => {
    await setPrimary("**pasted** ");
    const at = await pointAt("world", 0);
    await browser
      .action("pointer")
      .move(at)
      .down({ button: 1 })
      .up({ button: 1 })
      .perform();
    await browser.waitUntil(
      async () => (await editorText())[0].includes("pasted"),
      { timeout: 3000 },
    );
    expect((await editorText())[0]).toBe("Hello **pasted** world");
  });
});
