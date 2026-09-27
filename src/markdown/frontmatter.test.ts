import { describe, expect, it } from "vitest";

import {
  frontmatterError,
  joinFrontmatter,
  readFrontmatter,
  readProperties,
  setProperties,
  splitFrontmatter,
} from "./frontmatter";

describe("splitFrontmatter", () => {
  it("separates the frontmatter from the markdown", () => {
    expect(splitFrontmatter("---\ntitle: Hi\ntags: [a]\n---\n# Hi\n")).toEqual({
      frontmatter: "title: Hi\ntags: [a]",
      body: "# Hi\n",
    });
  });

  it("keeps comments and the order of the keys", () => {
    const yaml = "# draft\nb: 2\na: 1 # one";
    expect(splitFrontmatter(`---\n${yaml}\n---\n`).frontmatter).toBe(yaml);
  });

  it("reads Windows line endings and a byte order mark", () => {
    expect(splitFrontmatter("﻿---\r\na: 1\r\nb: 2\r\n---\r\ntext")).toEqual({
      frontmatter: "a: 1\nb: 2",
      body: "text",
    });
  });

  it("accepts `...` as the end of the frontmatter", () => {
    expect(splitFrontmatter("---\na: 1\n...\ntext").frontmatter).toBe("a: 1");
  });

  it("reads empty frontmatter", () => {
    expect(splitFrontmatter("---\n---\ntext")).toEqual({
      frontmatter: "",
      body: "text",
    });
  });

  it("reads frontmatter at the end of the file", () => {
    expect(splitFrontmatter("---\na: 1\n---")).toEqual({
      frontmatter: "a: 1",
      body: "",
    });
  });

  it("keeps a mapping with errors, so saving doesn't destroy it", () => {
    expect(splitFrontmatter("---\ntitle: a: b\n---\n").frontmatter).toBe(
      "title: a: b",
    );
  });

  it.each([
    ["a rule and a line of text", "---\nSome text\n---\n"],
    ["a rule and a heading", "---\n\n# Title\n\n---\n"],
    ["a list between rules", "---\n- one\n- two\n---\n"],
    ["a rule without its end", "---\na: 1\n"],
    ["frontmatter below the top", "\n---\na: 1\n---\n"],
    ["a rule of four dashes", "----\na: 1\n----\n"],
  ])("leaves %s as markdown", (_, text) => {
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });
});

describe("joinFrontmatter", () => {
  it("returns the markdown if there is no frontmatter", () => {
    expect(joinFrontmatter(null, "# Hi")).toBe("# Hi");
  });

  it("puts the frontmatter on top, separated by an empty line", () => {
    expect(joinFrontmatter("a: 1", "# Hi")).toBe("---\na: 1\n---\n\n# Hi");
  });

  it("writes empty frontmatter and an empty body", () => {
    expect(joinFrontmatter("", "")).toBe("---\n---\n");
  });

  it("keeps empty lines at the end of the frontmatter", () => {
    const { frontmatter, body } = splitFrontmatter("---\na: 1\n\n---\n\ntext");
    expect(frontmatter).toBe("a: 1\n");
    expect(joinFrontmatter(frontmatter, body.replace(/^\n/, ""))).toBe(
      "---\na: 1\n\n---\n\ntext",
    );
  });

  it("round-trips with splitFrontmatter", () => {
    const text = "---\n# note\ntitle: Hi\n---\n\ntext";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(joinFrontmatter(frontmatter, body.replace(/^\n/, ""))).toBe(text);
  });
});

describe("readProperties", () => {
  it("reads the title and the author", () => {
    expect(readProperties("title: The Lighthouse\nauthor: Ada")).toEqual({
      title: "The Lighthouse",
      author: "Ada",
    });
  });

  it("joins several authors", () => {
    expect(readProperties("author: [Ada, Grace]").author).toBe("Ada, Grace");
  });

  it("reads numbers as text", () => {
    expect(readProperties("title: 1984").title).toBe("1984");
  });

  it.each([
    ["no frontmatter", null],
    ["empty frontmatter", ""],
    ["broken YAML", "title: [unclosed"],
    ["a list", "- a"],
    ["empty values", "title: ''\nauthor: []"],
    ["other types", "title: { a: 1 }\nauthor: true"],
  ])("reads nothing from %s", (_, frontmatter) => {
    expect(readProperties(frontmatter)).toEqual({});
  });
});

describe("setProperties", () => {
  it("adds keys after the existing ones, keeping comments", () => {
    expect(setProperties("# note\ntags: [a] # mine", { title: "Hi" })).toBe(
      "# note\ntags: [a] # mine\ntitle: Hi",
    );
  });

  it("changes and removes keys", () => {
    expect(
      setProperties("title: Old\nauthor: Ada\ntags: [a]", {
        title: "New",
        author: undefined,
      }),
    ).toBe("title: New\ntags: [a]");
  });

  it("creates frontmatter", () => {
    expect(setProperties(null, { title: "Hi", author: "Ada" })).toBe(
      "title: Hi\nauthor: Ada",
    );
  });

  it("returns the frontmatter unchanged if nothing changes", () => {
    const frontmatter = "title:   Hi   # same";
    expect(setProperties(frontmatter, { title: "Hi", author: undefined })).toBe(
      frontmatter,
    );
    expect(setProperties(null, { title: undefined })).toBeNull();
  });

  it("quotes values YAML would read differently", () => {
    const frontmatter = setProperties(null, { title: "Yes: no # maybe" });
    expect(readProperties(frontmatter).title).toBe("Yes: no # maybe");
  });

  it.each([
    ["broken YAML", "title: a: b"],
    ["a list", "- a\n- b"],
  ])("leaves %s as it is", (_, frontmatter) => {
    expect(setProperties(frontmatter, { title: "Hi" })).toBe(frontmatter);
  });

  it("removes the frontmatter with its last key", () => {
    expect(setProperties("title: Hi", { title: undefined })).toBeNull();
  });
});

describe("readFrontmatter", () => {
  it("reads the keys and values", () => {
    expect(readFrontmatter("title: Hi\ntags: [a]")).toEqual({
      title: "Hi",
      tags: ["a"],
    });
  });

  it.each([null, "", "  \n", "# only a comment"])(
    "reads no keys from %j",
    (frontmatter) => {
      expect(readFrontmatter(frontmatter)).toEqual({});
    },
  );

  it.each(["title: [unclosed", "a: 1\na: 2", "- a", "just text"])(
    "can't read %j",
    (frontmatter) => {
      expect(readFrontmatter(frontmatter)).toBeUndefined();
    },
  );
});

describe("frontmatterError", () => {
  it.each(["", "title: Hi\n# note", "# only a comment"])(
    "accepts %j",
    (yaml) => {
      expect(frontmatterError(yaml)).toBeNull();
    },
  );

  it("explains YAML errors in one line", () => {
    expect(frontmatterError("title: [unclosed")).toMatch(/^[A-Z].*at line 1/);
  });

  it.each(["- a list", "just text"])("refuses %j", (yaml) => {
    expect(frontmatterError(yaml)).toBe(
      "The properties must be names with values, like title: My text",
    );
  });

  it("refuses a line that would end the frontmatter", () => {
    expect(frontmatterError("a: 1\n---\nb: 2")).toBe(
      "A line with only --- or ... would end the properties",
    );
  });
});
