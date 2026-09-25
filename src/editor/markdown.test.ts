import { describe, expect, it } from "vitest";
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

import welcomeMessage from "./welcome.md?raw";

describe("markdown", () => {
  it("parses the welcome document", () => {
    const doc = defaultMarkdownParser.parse(welcomeMessage);
    expect(doc.toJSON()).toMatchSnapshot();
  });

  it("serializes the welcome document", () => {
    const doc = defaultMarkdownParser.parse(welcomeMessage);
    expect(defaultMarkdownSerializer.serialize(doc)).toMatchSnapshot();
  });

  it("round-trips the welcome document", () => {
    const doc = defaultMarkdownParser.parse(welcomeMessage);
    const reparsed = defaultMarkdownParser.parse(
      defaultMarkdownSerializer.serialize(doc),
    );
    expect(reparsed.eq(doc)).toBe(true);
  });
});
