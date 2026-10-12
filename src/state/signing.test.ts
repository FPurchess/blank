import { afterEach, describe, expect, it } from "vitest";

import { config } from "../config";
import { DATE_FORMATS } from "../signing/date";
import { language } from "./language";
import { signingDates } from "./signing";

describe("how the dates next to signatures are written", () => {
  const defaultConfig = config.value;
  const defaultLanguage = language.value;
  // a format that isn't the default
  const OTHER = DATE_FORMATS.find(
    (format) => format !== defaultConfig.signing.dateFormat,
  )!;

  afterEach(() => {
    config.value = defaultConfig;
    language.value = defaultLanguage;
  });

  it("stays the same object while the settings change elsewhere", () => {
    const before = signingDates.value;
    config.value = {
      ...defaultConfig,
      layout: { page: { ...defaultConfig.layout.page } },
    };
    expect(signingDates.value).toBe(before);
    config.value = {
      ...defaultConfig,
      signing: { ...defaultConfig.signing, dateFormat: OTHER },
    };
    expect(signingDates.value).not.toBe(before);
    expect(signingDates.value.format).toBe(OTHER);
    language.value = language.value === "de" ? "fr" : "de";
    expect(signingDates.value.language).toBe(language.value);
  });
});
