import { describe, expect, it } from "vitest";

import {
  appliesOnEnter,
  MARGIN_FIELDS,
  problemId,
  problemsOf,
  sentence,
  steppedPaper,
  stopAfter,
  stopsIn,
  UNREADABLE,
} from "./pageSetupModel";

describe("MARGIN_FIELDS", () => {
  it("has a field per side, labelled by it", () => {
    expect(MARGIN_FIELDS.map((field) => field.label)).toEqual([
      "Top",
      "Right",
      "Bottom",
      "Left",
    ]);
  });
});

describe("stopsIn", () => {
  it("finds the option in the tab order of each row and the visible fields", () => {
    const element = document.createElement("div");
    element.innerHTML = `
      <div data-row="a"><button tabindex="-1"></button><button id="a" tabindex="0"></button></div>
      <div class="custom" hidden><input id="gone"></div>
      <div class="custom"><input id="field"></div>
      <div data-row="b"><button id="b" tabindex="0"></button></div>
      <div data-row="c"><button id="list" aria-haspopup="menu"></button></div>`;

    expect(stopsIn(element).map((stop) => stop.id)).toEqual([
      "a",
      "field",
      "b",
      "list",
    ]);
  });
});

describe("stopAfter", () => {
  const [a, b] = [document.createElement("i"), document.createElement("b")];

  it("goes to the stop above or below, and nowhere past the ends", () => {
    expect(stopAfter([a, b], a, 1)).toBe(b);
    expect(stopAfter([a, b], b, -1)).toBe(a);
    expect(stopAfter([a, b], b, 1)).toBeUndefined();
    expect(stopAfter([a, b], a, -1)).toBeUndefined();
  });

  it("starts at the first stop from anywhere else", () => {
    expect(stopAfter([a, b], null, 1)).toBe(a);
  });
});

describe("sentence", () => {
  it("ends a message in a period, unless it has its own mark", () => {
    expect(sentence("The top margin is small")).toBe(
      "The top margin is small.",
    );
    expect(sentence("Done.")).toBe("Done.");
    expect(sentence("Really?")).toBe("Really?");
  });
});

describe("problemsOf", () => {
  it("lists what can't be used of the rows, by their part", () => {
    expect(
      problemsOf({
        unreadable: false,
        errors: { paper: "P.", margins: undefined },
      }),
    ).toEqual([["paper", "P."]]);
    expect(problemsOf({ unreadable: false, errors: {} })).toEqual([]);
  });

  it("puts frontmatter that can't be read first", () => {
    expect(problemsOf({ unreadable: true, errors: { margins: "M." } })).toEqual(
      [
        ["properties", UNREADABLE],
        ["margins", "M."],
      ],
    );
  });

  it("gives the id of a part's problem, or none", () => {
    const problems = problemsOf({ unreadable: false, errors: { paper: "P." } });
    expect(problemId(problems, "paper")).toBe("page-setup-error-paper");
    expect(problemId(problems, "margins")).toBeUndefined();
  });
});

describe("steppedPaper", () => {
  const options = [{ value: "a" }, { value: "b" }, { value: "c" }];

  it("steps to the next or previous paper, and stops at the ends", () => {
    expect(steppedPaper(options, "b", 1)).toBe("c");
    expect(steppedPaper(options, "b", -1)).toBe("a");
    expect(steppedPaper(options, "c", 1)).toBeUndefined();
    expect(steppedPaper(options, "a", -1)).toBeUndefined();
  });
});

describe("appliesOnEnter", () => {
  it("applies on an option, not on a list or what isn't a button", () => {
    const option = document.createElement("button");
    const list = document.createElement("button");
    list.setAttribute("aria-haspopup", "menu");
    expect(appliesOnEnter(option)).toBe(true);
    expect(appliesOnEnter(list)).toBe(false);
    expect(appliesOnEnter(document.createElement("input"))).toBe(false);
    expect(appliesOnEnter(null)).toBe(false);
  });
});
