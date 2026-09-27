import { describe, expect, it } from "vitest";
import { markdownParser, markdownSerializer } from "../markdown";

import welcomeMessage from "./welcome.md?raw";

describe("markdown", () => {
  it("parses the welcome document", () => {
    const doc = markdownParser.parse(welcomeMessage);
    expect(doc.toJSON()).toMatchSnapshot();
  });

  it("serializes the welcome document", () => {
    const doc = markdownParser.parse(welcomeMessage);
    expect(markdownSerializer.serialize(doc)).toMatchSnapshot();
  });

  it("round-trips the welcome document", () => {
    const doc = markdownParser.parse(welcomeMessage);
    const reparsed = markdownParser.parse(markdownSerializer.serialize(doc));
    expect(reparsed.eq(doc)).toBe(true);
  });
});
