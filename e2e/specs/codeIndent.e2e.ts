import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser } from "@wdio/globals";

import {
  clickAt,
  Key,
  pressMod,
  pressShift,
  restartApp,
  textBox,
  type,
} from "../helpers.ts";

describe("code blocks", () => {
  let dir: string;
  let file: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-code-"));
    file = path.join(dir, "code.md");
    fs.writeFileSync(
      file,
      "# Code\n\n```\nx\n      six\n  two\n    four\ny\n```\n",
    );
    // a file passed on the command line saves with Mod-s, without a dialog
    await restartApp([file]);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("outdents the selected lines with Shift-Tab, each to the previous tab stop", async () => {
    const six = await textBox("six");
    await clickAt(six.left, (six.top + six.bottom) / 2);
    // from the start of the line "six" to the end of "four"
    await type(Key.Home);
    await pressShift(Key.ArrowDown);
    await pressShift(Key.ArrowDown);
    await pressShift(Key.End);
    await pressShift(Key.Tab);
    await pressMod("s");

    const expected = "```\nx\n    six\ntwo\nfour\ny\n```";
    await browser.waitUntil(
      () => fs.readFileSync(file, "utf8").includes(expected),
      {
        timeoutMsg: `the outdented code wasn't saved: ${fs.readFileSync(file, "utf8")}`,
      },
    );
  });
});
