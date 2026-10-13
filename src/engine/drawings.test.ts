import { describe, expect, it, vi } from "vitest";

import { createDrawingSync } from "./drawings";
import type { PageEngine } from "./engine";

describe("drawings handed to an engine", () => {
  it("are given once, again when drawn anew, and taken back when not shown", () => {
    const add = vi.fn(() => true);
    const remove = vi.fn();
    const sync = createDrawingSync({ add, remove });
    const engine = {} as PageEngine;
    sync(
      engine,
      new Map([
        ["a", "1"],
        ["b", undefined],
      ]),
    );
    sync(
      engine,
      new Map([
        ["a", "1"],
        ["b", undefined],
      ]),
    );
    expect(add.mock.calls).toEqual([[engine, "a", "1"]]);
    sync(engine, new Map([["a", "2"]]));
    expect(add).toHaveBeenLastCalledWith(engine, "a", "2");
    sync(engine, new Map());
    expect(remove).toHaveBeenCalledExactlyOnceWith(engine, "a");
    // another engine gets its own
    sync({} as PageEngine, new Map([["a", "2"]]));
    expect(add).toHaveBeenCalledTimes(3);
  });

  it("try again a drawing the engine couldn't read", () => {
    const add = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const sync = createDrawingSync({ add, remove: vi.fn() });
    const engine = {} as PageEngine;
    sync(engine, new Map([["a", "1"]]));
    sync(engine, new Map([["a", "1"]]));
    expect(add).toHaveBeenCalledTimes(2);
  });
});
