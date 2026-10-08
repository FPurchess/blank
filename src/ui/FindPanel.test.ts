import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { find } from "../editor/plugins/find";
import { openFind, setFind } from "../editor/plugins/find/commands";
import { findKey } from "../editor/plugins/find/state";
import {
  controlsStay,
  findOptions,
  findPanel,
  NO_FIND_OPTIONS,
  settingsDialog,
  uiTakesFocus,
} from "../state";
import { createEditorHandle } from "../editor/handle";
import { createState, createTestView, doc, p } from "../test/editor";
import { bootApp } from "./mount";
import {
  countText,
  errorText,
  hasMatches,
  panelAnchor,
} from "./findPanelModel";

// The find panel through the app: its field, its count, its toggles and its
// keys

const settle = async () => {
  await nextTick();
  await nextTick();
};

const panel = () => document.querySelector<HTMLElement>("#find-panel");
const field = () =>
  panel()!.querySelector<HTMLInputElement>('[aria-label="Find"]')!;
const count = () => panel()!.querySelector(".count")!.textContent;

const typeInto = async (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await settle();
};

const press = async (target: Element, key: string, shiftKey = false) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
  await settle();
};

describe("the find panel", () => {
  let dispose = () => {};
  let handle: ReturnType<typeof createEditorHandle>["handle"];

  beforeEach(async () => {
    document.body.replaceChildren();
    findOptions.value = NO_FIND_OPTIONS;
    // a handle whose state follows what's dispatched, as the app's does
    const view = createTestView(
      createState(doc(p("the cat and the hat"), p("The end")), {
        plugins: [find()],
      }),
    );
    const created = createEditorHandle(view);
    const dispatch = view.dispatch;
    view.dispatch = (tr) => {
      dispatch(tr);
      created.sync();
    };
    handle = created.handle;
    dispose = bootApp(handle);
    handle.run(openFind());
    await settle();
  });

  afterEach(() => {
    findPanel.value = null;
    dispose();
  });

  const found = () => findKey.getState(handle.state.value)!;

  it("opens with the focus in its field, named for screen readers", () => {
    expect(panel()!.getAttribute("role")).toBe("search");
    expect(panel()!.getAttribute("aria-label")).toBe("Find and replace");
    expect(document.activeElement).toBe(field());
    // the editor leaves it the focus, and the controls stay in focus mode
    expect(uiTakesFocus.value).toBe(true);
    expect(controlsStay.value).toBe(true);
  });

  it("counts what it finds as it's typed, in a live region", async () => {
    expect(count()).toBe("");
    await typeInto(field(), "the");
    expect(count()).toBe("1 of 3");
    expect(panel()!.querySelector(".count")!.getAttribute("aria-live")).toBe(
      "polite",
    );
    await typeInto(field(), "xyz");
    expect(count()).toBe("No matches");
  });

  it("goes to the next and previous match with Enter, Shift+Enter and F3", async () => {
    await typeInto(field(), "the");
    await press(field(), "Enter");
    expect(count()).toBe("2 of 3");
    await press(field(), "Enter", true);
    expect(count()).toBe("1 of 3");
    await press(document.body, "F3");
    expect(count()).toBe("2 of 3");
  });

  it("matches case and whole words when switched on, for the session", async () => {
    await typeInto(field(), "the");
    const matchCase = panel()!.querySelector<HTMLElement>(
      '[aria-label="Match case"]',
    )!;
    expect(matchCase.getAttribute("aria-pressed")).toBe("false");
    matchCase.click();
    await settle();
    expect(matchCase.getAttribute("aria-pressed")).toBe("true");
    expect(findOptions.value.matchCase).toBe(true);
    expect(count()).toBe("1 of 2");
  });

  it("says why a pattern can't be read, and marks the field", async () => {
    panel()!
      .querySelector<HTMLElement>('[aria-label="Regular expression"]')!
      .click();
    await settle();
    await typeInto(field(), "(the");
    expect(panel()!.querySelector("#find-error")!.textContent).toContain(
      "That pattern can't be read",
    );
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(count()).toBe("");
  });

  it("turns its arrows and Replace off without a match, never Done", async () => {
    const off = () =>
      [
        ...panel()!.querySelectorAll<HTMLElement>(
          ".find-actions button[aria-disabled='true']",
        ),
      ].map(
        (button) =>
          button.getAttribute("aria-label") ?? button.textContent!.trim(),
      );
    const all = ["Previous match", "Next match", "Replace", "Replace all"];

    expect(off()).toEqual(all);
    await typeInto(field(), "the");
    expect(off()).toEqual([]);
    await typeInto(field(), "zebra");
    expect(off()).toEqual(all);
    // a pattern that can't be read finds nothing either
    findOptions.value = { ...NO_FIND_OPTIONS, regex: true };
    handle.run(setFind({ query: "(the", options: findOptions.value }));
    await settle();
    expect(off()).toEqual(all);
  });

  it("closes with Done, and leaves F3 to an open dialog", async () => {
    await typeInto(field(), "the");
    settingsDialog.value = {};
    await press(document.body, "F3");
    expect(count()).toBe("1 of 3");
    settingsDialog.value = null;
    const done = panel()!.querySelector<HTMLElement>(".find-done")!;
    expect(done.textContent?.trim()).toBe("Done");
    expect(done.dataset.tip).toBe("Close");
    expect(panel()!.querySelector('[aria-label="Close"]')).toBeNull();
    done.click();
    await settle();
    expect(panel()).toBeNull();
    // the match it was at selected, as Esc does
    const { from, to } = handle.state.value.selection;
    expect(handle.state.value.doc.textBetween(from, to)).toBe("the");
  });

  it("replaces with Enter in its field, and leaves an IME's Enter alone", async () => {
    await typeInto(field(), "the");
    const replace = panel()!.querySelector<HTMLInputElement>(
      '[aria-label="Replace with"]',
    )!;
    await typeInto(replace, "a");
    replace.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    );
    await settle();
    field().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    );
    await settle();
    expect(handle.state.value.doc.textContent).toBe(
      "the cat and the hatThe end",
    );
    expect(count()).toBe("1 of 3");

    await press(replace, "Enter");
    expect(handle.state.value.doc.textContent).toBe("a cat and the hatThe end");
  });

  it("replaces all, and closes with Esc", async () => {
    await typeInto(field(), "the");
    await typeInto(
      panel()!.querySelector<HTMLInputElement>('[aria-label="Replace with"]')!,
      "a",
    );
    [...panel()!.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Replace all")!
      .click();
    await settle();
    expect(handle.state.value.doc.textContent).toBe("a cat and a hata end");

    await press(field(), "Escape");
    expect(panel()).toBeNull();
    expect(found().active).toBe(false);
  });
});

describe("findPanelModel", () => {
  it("says nothing before a query or for a pattern it can't read", () => {
    expect(countText(undefined)).toBe("");
    expect(errorText(undefined)).toBe("");
    expect(hasMatches(undefined)).toBe(false);
  });

  it("sits at the top right of the pages, or of the window without them", () => {
    expect(panelAnchor({ top: 80, right: 700 }, 1000, 80)).toMatchObject({
      right: 692,
      top: 80,
    });
    expect(panelAnchor(null, 1000, 80)).toMatchObject({ right: 992 });
  });
});
