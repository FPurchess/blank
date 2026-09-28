import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { watch } from "vue";

import { config } from "../config";
import { DEFAULT_PAGE } from "../layout/settings";
import { createState, doc, docWithFrontmatter, h, p } from "../test/editor";
import { path, transaction } from "./document";
import { frontmatter, pageFields, pageLayout } from "./page";

// publishes a transaction of a document with the frontmatter
const publish = (yaml: string | null, text = "text") => {
  transaction.value = createState(
    yaml === null ? doc(p(text)) : docWithFrontmatter(yaml, p(text)),
  ).tr;
};

describe("pageLayout", () => {
  const defaultConfig = config.value;
  let changes: string[] = [];
  let stop = () => {};

  beforeEach(() => {
    transaction.value = null;
    changes = [];
    stop = watch(pageLayout, ({ layout }) => changes.push(layout.orientation), {
      flush: "sync",
    });
  });

  afterEach(() => {
    stop();
    config.value = defaultConfig;
    transaction.value = null;
  });

  it("resolves the document's page setup over the defaults", () => {
    publish("page:\n  orientation: landscape");

    expect(frontmatter.value).toBe("page:\n  orientation: landscape");
    expect(pageLayout.value.layout.orientation).toBe("landscape");
    expect(pageLayout.value.problems).toEqual([]);
  });

  it("stays as it is while typing leaves the frontmatter alone", () => {
    publish("page:\n  orientation: landscape", "a");
    publish("page:\n  orientation: landscape", "ab");
    publish("page:\n  orientation: landscape", "abc");

    expect(changes).toEqual(["landscape"]);
  });

  it("changes with the frontmatter", () => {
    publish("page:\n  orientation: landscape");
    publish(null);

    expect(changes).toEqual(["landscape", "portrait"]);
  });

  it("changes with the defaults", () => {
    publish(null);
    // no frontmatter before and after: nothing to resolve again
    expect(changes).toEqual([]);

    config.value = {
      ...defaultConfig,
      layout: {
        ...defaultConfig.layout,
        page: { ...DEFAULT_PAGE, orientation: "landscape" },
      },
    };

    expect(changes).toEqual(["landscape"]);
  });
});

describe("pageFields", () => {
  let changes: string[] = [];
  let stop = () => {};

  beforeEach(() => {
    transaction.value = null;
    path.value = null;
    changes = [];
    stop = watch(pageFields, ({ title }) => changes.push(title), {
      flush: "sync",
    });
  });

  afterEach(() => {
    stop();
    transaction.value = null;
    path.value = null;
  });

  const type = (...blocks: Parameters<typeof doc>) => {
    transaction.value = createState(doc(...blocks)).tr;
  };

  it("takes the title and author of the frontmatter, and the file", () => {
    publish("title: Tides\nauthor: Ada");
    path.value = "/notes/tides.md";

    expect(pageFields.value).toMatchObject({
      title: "Tides",
      author: "Ada",
      file: "tides",
    });
  });

  it("stays the same while typing leaves them alone", () => {
    publish("title: Tides", "a");
    publish("title: Tides", "ab");
    type(h(1, "Report"), p("a"));
    type(h(1, "Report"), p("ab"));

    // the title, then the heading once the title is gone
    expect(changes).toEqual(["Tides", "Report"]);
  });

  it("follows the first heading while there is no title", () => {
    type(h(1, "Report"));
    type(h(1, "Reports"));

    expect(changes).toEqual(["Report", "Reports"]);
  });
});
