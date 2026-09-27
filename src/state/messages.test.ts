import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watch } from "vue";

import {
  announce,
  announcement,
  bootMessages,
  flashSpellcheckMessage,
  spellcheckMessage,
} from "./messages";

describe("messages", () => {
  afterEach(() => {
    announcement.value = null;
    spellcheckMessage.value = null;
  });

  it("announces a message", () => {
    announce("A row added");

    expect(announcement.value?.text).toBe("A row added");
  });

  it.each([
    ["announce", announce, announcement],
    ["flashSpellcheckMessage", flashSpellcheckMessage, spellcheckMessage],
  ] as const)("%s tells the same text again", (_, show, ref) => {
    const seen: (string | undefined)[] = [];
    const stop = watch(ref, (message) => seen.push(message?.text), {
      flush: "sync",
    });

    show("No spelling errors");
    show("No spelling errors");
    stop();

    expect(seen).toEqual(["No spelling errors", "No spelling errors"]);
  });

  it("tells messages with the same text apart", () => {
    announce("A row added");
    const first = announcement.value;
    announce("A row added");

    expect(announcement.value?.id).not.toBe(first?.id);
  });
});

describe("bootMessages", () => {
  let dispose = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    dispose = bootMessages();
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
    announcement.value = null;
    spellcheckMessage.value = null;
  });

  it("clears a spell check message after 2 s", () => {
    flashSpellcheckMessage("No spelling errors");

    vi.advanceTimersByTime(1999);
    expect(spellcheckMessage.value?.text).toBe("No spelling errors");
    vi.advanceTimersByTime(1);
    expect(spellcheckMessage.value).toBeNull();
  });

  it("shows an announcement for 2 s, a longer one long enough to read", () => {
    announce("A row added");
    vi.advanceTimersByTime(2000);
    expect(announcement.value).toBeNull();

    const text = "x".repeat(50);
    announce(text);
    vi.advanceTimersByTime(2999);
    expect(announcement.value?.text).toBe(text);
    vi.advanceTimersByTime(1);
    expect(announcement.value).toBeNull();
  });

  it.each([
    ["announce", announce, announcement],
    ["flashSpellcheckMessage", flashSpellcheckMessage, spellcheckMessage],
  ] as const)("%s starts over with the same text again", (_, show, ref) => {
    show("No spelling errors");
    vi.advanceTimersByTime(1500);
    show("No spelling errors");
    vi.advanceTimersByTime(1500);
    expect(ref.value?.text).toBe("No spelling errors");

    vi.advanceTimersByTime(500);
    expect(ref.value).toBeNull();
  });

  it("stops clearing messages once disposed", () => {
    announce("A row added");
    dispose();
    vi.advanceTimersByTime(5000);

    expect(announcement.value?.text).toBe("A row added");
  });
});
