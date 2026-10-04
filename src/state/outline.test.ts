import { afterEach, describe, expect, it } from "vitest";

import { listedHeadings } from "../markdown/headings";
import { doc, h, p } from "../test/editor";
import { headings, publishHeadings } from "./headings";
import { announcement } from "./messages";
import {
  outlineEntries,
  outlinePeek,
  outlinePinned,
  toggleOutline,
} from "./outline";

afterEach(() => {
  headings.value = [];
  outlinePinned.value = false;
  outlinePeek.value = null;
  announcement.value = null;
});

describe("outlineEntries", () => {
  it("lists the headings with text, by their index", () => {
    publishHeadings(doc(h(1, "One"), h(2), p("text"), h(3, "Three")));
    expect(outlineEntries.value).toEqual([
      { index: 0, level: 1, text: "One" },
      { index: 1, level: 3, text: "Three" },
    ]);
  });

  it("lists what a table of contents lists, in its order", () => {
    const node = doc(h(1, "One"), h(2), h(4, "Deep"), h(2, "Two"));
    publishHeadings(node);
    expect(
      outlineEntries.value.map(({ level, text }) => ({ level, text })),
    ).toEqual(listedHeadings(node).map(({ level, text }) => ({ level, text })));
  });

  it("keeps the entries before an empty heading as it gets text", () => {
    publishHeadings(doc(h(1, "One"), h(2), h(2, "Two")));
    const [one] = outlineEntries.value;
    publishHeadings(doc(h(1, "One"), h(2, "N"), h(2, "Two")));
    expect(outlineEntries.value[0]).toBe(one);
    expect(outlineEntries.value.map(({ text }) => text)).toEqual([
      "One",
      "N",
      "Two",
    ]);
  });

  it("keeps an entry while only its position changes", () => {
    publishHeadings(doc(h(1, "One"), p("a"), h(2, "Two")));
    const [one, two] = outlineEntries.value;
    publishHeadings(doc(h(1, "One"), p("abc"), h(2, "Two")));
    expect(outlineEntries.value[0]).toBe(one);
    expect(outlineEntries.value[1]).toBe(two);
  });

  it("makes a new entry when its text changes", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    const [one, two] = outlineEntries.value;
    publishHeadings(doc(h(1, "One"), h(2, "Twice")));
    expect(outlineEntries.value[0]).toBe(one);
    expect(outlineEntries.value[1]).not.toBe(two);
    expect(outlineEntries.value[1].text).toBe("Twice");
  });
});

describe("toggleOutline", () => {
  it("does nothing but tell why with fewer than two headings", () => {
    publishHeadings(doc(h(1, "One"), h(2)));
    toggleOutline(1200);
    expect(outlinePinned.value).toBe(false);
    expect(outlinePeek.value).toBeNull();
    expect(announcement.value?.text).toBe(
      "The outline shows once there are two headings",
    );
  });

  it("pins and unpins it on a wide window", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    outlinePeek.value = "hover";
    toggleOutline(1000);
    expect(outlinePinned.value).toBe(true);
    expect(outlinePeek.value).toBeNull();
    expect(announcement.value?.text).toBe("Outline shown");
    toggleOutline(1000);
    expect(outlinePinned.value).toBe(false);
    expect(announcement.value?.text).toBe("Outline hidden");
  });

  it("opens and closes it floating on a narrow window, keeping the pin", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    outlinePinned.value = true;
    toggleOutline(999);
    expect(outlinePeek.value).toBe("sticky");
    expect(outlinePinned.value).toBe(true);
    expect(announcement.value?.text).toBe("Outline shown");
    toggleOutline(999);
    expect(outlinePeek.value).toBeNull();
    expect(announcement.value?.text).toBe("Outline hidden");
  });

  it("keeps a peek the pointer opened open on a narrow window", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    outlinePeek.value = "hover";
    toggleOutline(800);
    expect(outlinePeek.value).toBe("sticky");
  });
});
