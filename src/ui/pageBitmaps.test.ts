import { describe, expect, it, vi } from "vitest";

import {
  BitmapCache,
  bitmapKey,
  engineId,
  FRAME_BUDGET,
  PaintQueue,
  type Scheduler,
} from "./pageBitmaps";

const bitmap = (width: number, height: number) => ({
  width,
  height,
  close: vi.fn(),
});

describe("BitmapCache", () => {
  it("keeps the recently used bitmaps within its limit", () => {
    // room for two of 10 × 10 pixels
    const cache = new BitmapCache(2 * 10 * 10 * 4);
    const a = bitmap(10, 10);
    const b = bitmap(10, 10);
    const c = bitmap(10, 10);
    cache.set("a", a);
    cache.set("b", b);
    // "a" is used again, so "b" is the oldest
    expect(cache.get("a")).toBe(a);
    cache.set("c", c);
    expect(cache.get("b")).toBeUndefined();
    expect(b.close).toHaveBeenCalled();
    expect(cache.size).toBe(2);
    expect(cache.used).toBe(800);
    // one too large for the limit is kept alone
    cache.set("big", bitmap(20, 20));
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.used).toBe(0);
  });

  it("replaces the bitmap of a key", () => {
    const cache = new BitmapCache(10_000);
    const old = bitmap(5, 5);
    cache.set("a", old);
    cache.set("a", bitmap(5, 5));
    expect(old.close).toHaveBeenCalled();
    expect(cache.used).toBe(100);
  });
});

describe("engineId", () => {
  it("numbers each engine once", () => {
    const a = {};
    const b = {};
    expect(engineId(a)).toBe(engineId(a));
    expect(engineId(b)).not.toBe(engineId(a));
  });
});

describe("bitmapKey", () => {
  it("tells apart what changes a painted page", () => {
    const parts = {
      engine: 1,
      layer: "body",
      page: 1,
      version: 3,
      width: 100,
      height: 200,
      scale: 1.5,
      ratio: 2,
      x: 0,
      y: 0,
      theme: "light",
      images: 0,
    };
    const key = bitmapKey(parts);
    expect(bitmapKey({ ...parts })).toBe(key);
    for (const change of [
      { version: 4 },
      { ratio: 1 },
      { theme: "dark" },
      { scale: 1.25 },
      { images: 1 },
      { engine: 2 },
      { layer: "bands" },
      { images: "10" },
    ])
      expect(bitmapKey({ ...parts, ...change })).not.toBe(key);
  });
});

/**
 * a scheduler run by hand, with a clock each job moves on
 */
const manual = () => {
  const frames: (() => void)[] = [];
  const tasks: (() => void)[] = [];
  let time = 0;
  const scheduler: Scheduler = {
    frame: (callback) => frames.push(callback),
    later: (callback) => tasks.push(callback),
    now: () => time,
  };
  const job = (key: string, priority: number, ran: string[], cost = 3) => ({
    key,
    priority,
    run: () => {
      ran.push(key);
      time += cost;
    },
  });
  return { scheduler, frames, tasks, job };
};

describe("PaintQueue", () => {
  it("paints in the next frame, the pages in view first", () => {
    const { scheduler, frames, tasks, job } = manual();
    const queue = new PaintQueue(scheduler);
    const ran: string[] = [];
    queue.request(job("near", 1, ran));
    queue.request(job("shown", 0, ran));
    // nothing paints while the request is made
    expect(ran).toEqual([]);
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(ran).toEqual(["shown", "near"]);
    expect(tasks).toHaveLength(0);
  });

  it("paints the pages in view whatever they take, the rest within a budget", () => {
    const { scheduler, frames, tasks, job } = manual();
    const queue = new PaintQueue(scheduler);
    const ran: string[] = [];
    queue.request(job("a", 0, ran, FRAME_BUDGET));
    queue.request(job("b", 0, ran, FRAME_BUDGET));
    queue.request(job("c", 1, ran));
    queue.request(job("d", 1, ran));
    frames.shift()!();
    // both in view, then no time left for the others
    expect(ran).toEqual(["a", "b"]);
    expect(queue.pending).toBe(2);
    // the rest in a task after the frame
    tasks.shift()!();
    expect(ran).toEqual(["a", "b", "c", "d"]);
    expect(queue.pending).toBe(0);
  });

  it("paints a page once for several requests, and not once cancelled", () => {
    const { scheduler, frames, job } = manual();
    const queue = new PaintQueue(scheduler);
    const ran: string[] = [];
    queue.request({ ...job("page", 0, ran), run: () => ran.push("old") });
    queue.request(job("page", 0, ran));
    queue.request(job("gone", 0, ran));
    queue.cancel("gone");
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(ran).toEqual(["page"]);
  });
});
