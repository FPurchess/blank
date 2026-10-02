import { afterEach, describe, expect, it } from "vitest";

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
      { index: 2, level: 3, text: "Three" },
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
