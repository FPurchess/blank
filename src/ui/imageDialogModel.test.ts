import { describe, expect, it } from "vitest";

import {
  checkImage,
  describeFile,
  sourcePlaceholder,
} from "./imageDialogModel";

describe("checkImage", () => {
  it("accepts a path or web address without a hint", () => {
    expect(checkImage("images/chart.png", null)).toEqual({
      hint: "",
      valid: true,
      blocked: false,
    });
  });

  it("says that an embedded image is embedded, whatever the field shows", () => {
    expect(checkImage("", "data:image/png;base64,AAAA")).toEqual({
      hint: "Embedded in the document",
      valid: true,
      blocked: false,
    });
  });

  it("blocks addresses that can't be saved", () => {
    expect(checkImage("javascript:alert(1)", null)).toMatchObject({
      valid: false,
      blocked: true,
    });
  });

  it("asks for a source only once the user tries to insert without one", () => {
    expect(checkImage("", null).hint).toBe("");
    expect(checkImage("", null, true)).toEqual({
      hint: "Choose a file, or enter a path or web address",
      valid: false,
      blocked: false,
    });
  });
});

describe("checkImage while choosing", () => {
  it("says that a file is being chosen, whatever it would say otherwise", () => {
    expect(checkImage("", null, true, true)).toEqual({
      hint: "Choosing a file…",
      valid: false,
      blocked: false,
    });
    expect(checkImage("", "data:image/png;base64,AAAA", false, true).hint).toBe(
      "Choosing a file…",
    );
  });

  it("keeps whether a typed source can be inserted", () => {
    expect(checkImage("images/chart.png", null, false, true)).toEqual({
      hint: "Choosing a file…",
      valid: true,
      blocked: false,
    });
    expect(checkImage("javascript:alert(1)", null, false, true)).toEqual({
      hint: "Choosing a file…",
      valid: false,
      blocked: true,
    });
  });
});

describe("sourcePlaceholder", () => {
  it("says an image is embedded, or shows an example of a path", () => {
    expect(sourcePlaceholder("data:image/png;base64,AAAA")).toBe(
      "Embedded image",
    );
    expect(sourcePlaceholder(null)).toBe("images/chart.png");
  });
});

describe("describeFile", () => {
  it.each([
    ["chart.png", "chart"],
    ["my.chart.jpeg", "my.chart"],
    ["README", "README"],
  ])("describes %j as %j", (name, description) => {
    expect(describeFile(name)).toBe(description);
  });
});
