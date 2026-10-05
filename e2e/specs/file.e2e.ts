import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  clickInto,
  expectActiveTab,
  expectEditorText,
  focusEditor,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

/**
 * appends `text` to the first paragraph and saves with Mod-s
 */
const appendAndSave = async (text: string) => {
  await clickInto("#editor p");
  await type(Key.End);
  await type(text);
  await pressMod("s");
};

/**
 * waits until the file at `filePath` has `content`
 */
const waitForFile = async (filePath: string, content: string) => {
  await browser.waitUntil(() => fs.readFileSync(filePath, "utf8") === content, {
    timeoutMsg: `${filePath} has not been saved, it contains: ${fs.readFileSync(filePath, "utf8")}`,
  });
};

describe("file", () => {
  let fixtureDir: string;
  let fixturePath: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    fixturePath = path.join(fixtureDir, "fixture.md");
    fs.writeFileSync(fixturePath, "# E2E Fixture\n\nOriginal paragraph.\n");

    // open the file via command-line argument, see src-tauri/src/open.rs
    await restartApp([fixturePath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("opens the file passed via command-line argument", async () => {
    await expectEditorText("#editor h1", "E2E Fixture");
    await expectEditorText("#editor p", "Original paragraph.");
    await expectActiveTab("fixture", fixturePath);
  });

  it("saves changes to the opened file", async () => {
    await clickInto("#editor p");
    await type(Key.End);
    await type(" Appended");
    await expectEditorText("#editor p", "Original paragraph. Appended");

    // the path is known, hence saving does not open a dialog
    await pressMod("s");

    await browser.waitUntil(
      () =>
        fs
          .readFileSync(fixturePath, "utf8")
          .includes("Original paragraph. Appended"),
      { timeoutMsg: "the file has not been saved" },
    );
    expect(fs.readFileSync(fixturePath, "utf8")).toBe(
      "# E2E Fixture\n\nOriginal paragraph. Appended",
    );
  });
});

// Blank must open and save every file the user can, wherever it is
describe("file access", () => {
  let fixtureDir: string;

  before(() => {
    // the real path, as the app shows and resolves it
    fixtureDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-access-")),
    );
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("saves a file in a hidden folder", async () => {
    const filePath = path.join(fixtureDir, ".hidden", "note.md");
    fs.mkdirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, "Hidden note.\n");

    await restartApp([filePath]);
    await expectEditorText("#editor p", "Hidden note.");
    await appendAndSave(" Saved");

    await waitForFile(filePath, "Hidden note. Saved");
  });

  it("saves a file reached through a relative symlink", async () => {
    const target = path.join(fixtureDir, "real", "note.md");
    const link = path.join(fixtureDir, "link.md");
    fs.mkdirSync(path.dirname(target));
    fs.writeFileSync(target, "Linked note.\n");
    fs.symlinkSync(path.join("real", "note.md"), link);

    await restartApp([link]);
    await expectEditorText("#editor p", "Linked note.");
    await appendAndSave(" Saved");

    await waitForFile(target, "Linked note. Saved");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("saves a file passed as relative path with ..", async () => {
    const filePath = path.join(fixtureDir, "relative.md");
    fs.writeFileSync(filePath, "Relative note.\n");
    // the app inherits the working directory of tauri-driver, i.e. of this process
    const relative = path.relative(process.cwd(), filePath);
    expect(relative.startsWith("..")).toBe(true);

    await restartApp([relative]);
    await expectEditorText("#editor p", "Relative note.");
    // the app remembers the absolute path, so it doesn't depend on where it was started
    await expectActiveTab("relative", filePath);
    await appendAndSave(" Saved");

    await waitForFile(filePath, "Relative note. Saved");
  });

  it("keeps the opened file when undoing right after opening it", async () => {
    const filePath = path.join(fixtureDir, "undo.md");
    fs.writeFileSync(filePath, "Keep me.\n");

    await restartApp([filePath]);
    await expectEditorText("#editor p", "Keep me.");
    await focusEditor();
    await pressMod("z");
    await pressMod("z");
    await expectEditorText("#editor p", "Keep me.");

    await pressMod("s");
    await waitForFile(filePath, "Keep me.");
  });
});
