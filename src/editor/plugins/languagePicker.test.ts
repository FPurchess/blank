import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bindKeys } from "../../test/keymap";
import { CommandIdentifier, config } from "../../config";

import { PAGE_PRESS } from "../pagePointer";
import { pagePointer } from "../../test/pagePointer";
import {
  createState,
  createTestView,
  doc,
  p,
  pressKey,
  typeText,
} from "../../test/editor";
import { closePicker, openPicker } from "../../languagePicker";
import { language, languagePicker as pickerState } from "../../state";
import { languagePicker } from "./languagePicker";

/**
 * setup creates a view with the language picker plugin
 */
const setup = () => {
  const plugin = languagePicker();
  const view = createTestView(
    createState(doc(p("text")), { plugins: [plugin] }),
  );
  return {
    view,
    plugin,
    press: (key: string) => pressKey(view, plugin, key),
  };
};

describe("plugin.languagePicker", () => {
  const defaults = config.value;
  beforeEach(() => {
    language.value = "de";
    closePicker();
  });
  afterEach(() => {
    config.value = defaults;
  });

  it("closes on the key that opens it, also after it changed", () => {
    const { press } = setup();
    bindKeys({ [CommandIdentifier.LANGUAGE_CHOOSE]: "F8" });
    openPicker();

    expect(press("Mod-Alt-l")).toBe(true);
    expect(pickerState.value.open).toBe(true);
    expect(press("F8")).toBe(true);
    expect(pickerState.value.open).toBe(false);
  });

  it("leaves keys alone while the picker is closed", () => {
    const { plugin, view, press } = setup();

    expect(press("ArrowRight")).toBe(false);
    expect(
      plugin.props.handleTextInput?.call(
        plugin,
        view,
        5,
        5,
        "x",
        () => view.state.tr,
      ),
    ).toBe(false);
  });

  it("chooses a language with the arrow keys and Enter", () => {
    const { press } = setup();
    openPicker();

    expect(press("ArrowRight")).toBe(true);
    expect(pickerState.value.selected).toBe("de-AT");
    expect(press("ArrowLeft")).toBe(true);
    expect(press("ArrowLeft")).toBe(true);
    expect(pickerState.value.selected).toBe("da");
    expect(press("Enter")).toBe(true);

    expect(language.value).toBe("da");
    expect(pickerState.value.open).toBe(false);
  });

  it("chooses a typed language code", () => {
    const { press } = setup();
    openPicker();

    press("p");
    press("x");
    expect(pickerState.value.invalid).toBe(true);
    press("P");
    press("Backspace");
    press("t");
    press("r");
    press("Enter");

    expect(language.value).toBe("tr");
  });

  it("chooses a typed regional variant", () => {
    const { press } = setup();
    openPicker();

    for (const key of ["d", "e", "-", "c", "h"]) press(key);
    press("Enter");

    expect(language.value).toBe("de-CH");
  });

  it("closes with Escape without choosing", () => {
    const { press } = setup();
    openPicker();

    press("ArrowRight");
    expect(press("Escape")).toBe(true);

    expect(language.value).toBe("de");
    expect(pickerState.value.open).toBe(false);
  });

  it("keeps a current language without rules of its own reachable", () => {
    const { press } = setup();
    language.value = "tr";
    openPicker();

    press("ArrowRight");
    press("ArrowLeft");
    press("Enter");

    expect(language.value).toBe("tr");
  });

  it("clears a rejected code on Escape", () => {
    const { press } = setup();
    openPicker();

    press("x");
    press("x");
    press("Escape");

    expect(pickerState.value.invalid).toBe(false);
  });

  it("closes with the binding that opened it", () => {
    const { press } = setup();
    openPicker();

    expect(press("Mod-Alt-l")).toBe(true);
    expect(pickerState.value.open).toBe(false);
  });

  it("keeps other keys and typed text from the document", () => {
    const { plugin, view, press } = setup();
    openPicker();

    expect(press("Mod-b")).toBe(true);
    expect(press("1")).toBe(true);
    typeText(view, plugin, "");
    expect(
      plugin.props.handleTextInput?.call(
        plugin,
        view,
        5,
        5,
        "x",
        () => view.state.tr,
      ),
    ).toBe(true);
    expect(pickerState.value.selected).toBe("de");
  });

  it("closes when the pages are pressed", () => {
    const { plugin, view } = setup();
    const press = plugin.props.handleDOMEvents![PAGE_PRESS]!;
    const event = () => new CustomEvent(PAGE_PRESS, { detail: pagePointer(1) });

    expect(press.call(plugin, view, event())).toBe(false);
    openPicker();
    press.call(plugin, view, event());

    expect(pickerState.value.open).toBe(false);
  });
});
