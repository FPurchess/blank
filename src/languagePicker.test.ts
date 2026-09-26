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
    const languages = pickerLanguages();
    const index = languages.indexOf("de");

    move(1);
    expect(languagePicker.value.selected).toBe(languages[index + 1]);

    move(-1);
    move(-languages.length);
    expect(languagePicker.value.selected).toBe("de");

    select(languages[0]);
    move(-1);
    expect(languagePicker.value.selected).toBe(languages[languages.length - 1]);
  });

  it("steps through the languages with rules and common variants", () => {
    expect(pickerLanguages()).toEqual(
      [
        ...supportedLanguages,
        ...["de-AT", "de-CH", "en-AU", "en-CA", "en-GB", "pt-PT"],
      ].sort(),
    );
  });

  it("lists a language without rules of its own next to the others", () => {
    select("tr");

    expect(pickerLanguages()).toContain("tr");
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
    typeChar("I");
    expect(languagePicker.value).toMatchObject({ buffer: "i", invalid: false });

    typeChar("t");
    expect(languagePicker.value).toMatchObject({
      selected: "it",
      buffer: "",
      invalid: false,
    });
  });

  it("keeps typing after a code that has regional variants", () => {
    typeChar("p");
    typeChar("t");
    expect(languagePicker.value).toMatchObject({
      selected: "pt",
      buffer: "pt",
      invalid: false,
    });

    confirm();
    expect(language.value).toBe("pt");
  });

  it.each([
    ["dech", "de-CH"],
    ["de-ch", "de-CH"],
    ["esmx", "es-MX"],
    ["srlatn", "sr-Latn"],
    ["cavalencia", "ca-valencia"],
  ])("selects the typed regional variant %j", (letters, tag) => {
    for (const char of letters) typeChar(char);

    expect(languagePicker.value).toMatchObject({
      selected: tag,
      buffer: "",
      invalid: false,
    });
  });

  it("rejects a variant that doesn't exist", () => {
    for (const char of "dex") typeChar(char);

    expect(languagePicker.value).toMatchObject({
      selected: "de",
      buffer: "",
      invalid: true,
    });
  });

  it("removes a typed letter of a variant", () => {
    for (const char of "de-c") typeChar(char);
    backspace();
    backspace();

    expect(languagePicker.value.buffer).toBe("de");
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
