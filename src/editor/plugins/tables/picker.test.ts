import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_PRESS } from "../../pagePointer";
import { pagePointer } from "../../../test/pagePointer";
import { tablePicker, type TablePickerState } from "../../../state";
import {
  createState,
  createTestView,
  doc,
  p,
  pressKey,
} from "../../../test/editor";
import { tablePickerKeys } from "./picker";

const open = (): TablePickerState => {
  const picker: TablePickerState = {
    cols: 3,
    rows: 3,
    anchor: { left: 0, top: 0, bottom: 0 },
    submit: vi.fn(),
    cancel: vi.fn(() => {
      tablePicker.value = null;
    }),
  };
  tablePicker.value = picker;
  return picker;
};

describe("tablePickerKeys", () => {
  const plugin = tablePickerKeys();
  const view = createTestView(createState(doc(p())));
  const press = (key: string) => pressKey(view, plugin, key);

  beforeEach(() => {
    tablePicker.value = null;
  });

  it("leaves keys alone while the picker is closed", () => {
    expect(press("ArrowDown")).toBe(false);
  });

  it("changes the size with the arrow keys", () => {
    open();
    press("ArrowRight");
    press("ArrowDown");
    press("ArrowDown");

    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 5 });
  });

  it("keeps the size between 1 and 20", () => {
    open();
    for (let i = 0; i < 5; i++) press("ArrowLeft");
    for (let i = 0; i < 30; i++) press("ArrowDown");

    expect(tablePicker.value).toMatchObject({ cols: 1, rows: 20 });
  });

  it("inserts the table with Enter", () => {
    const picker = open();
    press("ArrowRight");
    press("Enter");

    expect(picker.submit).toHaveBeenCalledWith(4, 3);
  });

  it("closes with Esc, the table key and any other key", () => {
    for (const key of ["Escape", "Mod-t", "x"]) {
      const picker = open();
      expect(press(key)).toBe(true);
      expect(picker.cancel).toHaveBeenCalled();
    }
  });

  it("stays open when only a modifier is pressed", () => {
    const picker = open();
    press("Shift");

    expect(picker.cancel).not.toHaveBeenCalled();
  });

  it("swallows typed text and closes on a click", () => {
    const picker = open();

    expect(
      plugin.props.handleTextInput?.call(
        plugin,
        view,
        1,
        1,
        "a",
        () => view.state.tr,
      ),
    ).toBe(true);
    plugin.props.handleDOMEvents?.[PAGE_PRESS]?.call(
      plugin,
      view,
      new CustomEvent(PAGE_PRESS, { detail: pagePointer(1) }),
    );
    expect(picker.cancel).toHaveBeenCalled();
  });
});
