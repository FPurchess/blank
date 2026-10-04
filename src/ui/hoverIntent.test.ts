import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoverIntent } from "./hoverIntent";

describe("hoverIntent", () => {
  const open = vi.fn();
  const close = vi.fn();
  const intent = (closeAfter = 500) =>
    hoverIntent({ openAfter: 300, closeAfter, open, close });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens once the pointer rested", () => {
    const hover = intent();
    hover.enter();
    vi.advanceTimersByTime(299);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledOnce();
  });

  it("doesn't open when the pointer leaves before", () => {
    const hover = intent();
    hover.enter();
    vi.advanceTimersByTime(200);
    hover.leave();
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("stays open while the pointer moves from the anchor to the card", () => {
    const hover = intent();
    hover.enter();
    vi.advanceTimersByTime(300);
    hover.leave();
    vi.advanceTimersByTime(100);
    hover.enter();
    vi.advanceTimersByTime(1000);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes at once without a delay", () => {
    const hover = intent(0);
    hover.enter();
    vi.advanceTimersByTime(300);
    hover.leave();
    expect(close).toHaveBeenCalledOnce();
  });

  it("opens now and drops what's pending", () => {
    const hover = intent();
    hover.enter();
    hover.openNow();
    expect(open).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(open).toHaveBeenCalledOnce();
  });

  it("cancels what's pending", () => {
    const hover = intent();
    hover.leave();
    hover.cancel();
    vi.advanceTimersByTime(1000);
    expect(close).not.toHaveBeenCalled();
  });
});
