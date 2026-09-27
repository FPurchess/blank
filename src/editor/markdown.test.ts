import { describe, expect, it } from "vitest";
import { parser, serializer } from "./markdown";

import welcomeMessage from "./welcome.md?raw";

describe("markdown", () => {
  it("parses the welcome document", () => {
    const doc = parser.parse(welcomeMessage);
    expect(doc.toJSON()).toMatchSnapshot();
  });

  it("serializes the welcome document", () => {
    const doc = parser.parse(welcomeMessage);
    expect(serializer.serialize(doc)).toMatchSnapshot();
  });

  it("round-trips the welcome document", () => {
    const doc = parser.parse(welcomeMessage);
    const reparsed = parser.parse(serializer.serialize(doc));
    expect(reparsed.eq(doc)).toBe(true);
  });
});
