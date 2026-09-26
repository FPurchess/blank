import { beforeEach, describe, expect, it } from "vitest";

import {
  backspace,
  closePicker,
  confirm,
  move,
  openPicker,
  pickerLanguages,
  select,
  typeChar,
} from "./languagePicker";
import { supportedLanguages } from "./editor/plugins/autocomplete/languages";
import { language, languagePicker } from "./state";

describe("languagePicker", () => {
  beforeEach(() => {
    language.value = "de";
    openPicker();
  });

  it("opens on the current language", () => {
    expect(languagePicker.value).toEqual({
      open: true,
      selected: "de",
      buffer: "",
      invalid: false,
    });
  });

  it("steps through the languages and wraps around", () => {
    const index = supportedLanguages.indexOf("de");

    move(1);
    expect(languagePicker.value.selected).toBe(supportedLanguages[index + 1]);

    move(-1);
    move(-supportedLanguages.length);
    expect(languagePicker.value.selected).toBe("de");

    select(supportedLanguages[0]);
    move(-1);
    expect(languagePicker.value.selected).toBe(
      supportedLanguages[supportedLanguages.length - 1],
    );
  });

  it("lists a language without rules of its own next to the others", () => {
    select("tr");

    expect(pickerLanguages()).toEqual([...supportedLanguages, "tr"].sort());
    move(-1);
    expect(languagePicker.value.selected).toBe("sv");
  });

  it("keeps a current language without rules of its own reachable", () => {
    language.value = "tr";
    openPicker();

    move(-1);
    expect(languagePicker.value.selected).toBe("sv");
    move(1);
    expect(languagePicker.value.selected).toBe("tr");
  });

  it("selects a typed ISO code", () => {
    typeChar("P");
    expect(languagePicker.value).toMatchObject({ buffer: "p", invalid: false });

    typeChar("t");
    expect(languagePicker.value).toMatchObject({
      selected: "pt",
      buffer: "",
      invalid: false,
    });
  });

  it("selects a typed ISO code without rules of its own", () => {
    typeChar("t");
    typeChar("r");

    expect(languagePicker.value.selected).toBe("tr");
  });

  it("rejects an invalid code", () => {
    typeChar("x");
    typeChar("x");

    expect(languagePicker.value).toMatchObject({
      selected: "de",
      buffer: "",
      invalid: true,
    });

    typeChar("f");
    expect(languagePicker.value.invalid).toBe(false);
  });

  it("removes a typed letter", () => {
    typeChar("f");
    backspace();

    expect(languagePicker.value.buffer).toBe("");
  });

  it("chooses the selected language", () => {
    select("fr");
    confirm();

    expect(language.value).toBe("fr");
    expect(languagePicker.value.open).toBe(false);
  });

  it("closes without choosing", () => {
    select("fr");
    closePicker();

    expect(language.value).toBe("de");
    expect(languagePicker.value.open).toBe(false);
  });

  it("forgets a rejected code when it closes", () => {
    typeChar("x");
    typeChar("x");
    closePicker();

    expect(languagePicker.value).toMatchObject({ buffer: "", invalid: false });
  });
});
