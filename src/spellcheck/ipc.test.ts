import { describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

import * as ipc from "./ipc";

describe("spellcheck ipc", () => {
  it("calls the engine's commands", async () => {
    const calls: [string, InvokeArgs | undefined][] = [];
    mockIPC(((cmd: string, args?: InvokeArgs) => {
      calls.push([cmd, args]);
      if (cmd === "spellcheck_check") return [true, false];
      if (cmd === "spellcheck_suggest") return ["house"];
      if (cmd === "spellcheck_status") return { available: true };
    }) as Parameters<typeof mockIPC>[0]);

    expect(await ipc.status("de")).toEqual({ available: true });
    await ipc.load("de", ["blank"]);
    expect(await ipc.check(["house", "housse"])).toEqual([true, false]);
    expect(await ipc.suggest("housse")).toEqual(["house"]);
    await ipc.add("blank");
    await ipc.remove("blank");
    await ipc.unload();

    expect(calls.map(([cmd]) => cmd)).toEqual([
      "spellcheck_status",
      "spellcheck_load",
      "spellcheck_check",
      "spellcheck_suggest",
      "spellcheck_add",
      "spellcheck_remove",
      "spellcheck_unload",
    ]);
    expect(calls[1][1]).toEqual({ tag: "de", userWords: ["blank"] });
  });

  it("reports the download progress", async () => {
    const onProgress = vi.fn();
    mockIPC(((cmd: string, args?: InvokeArgs) => {
      if (cmd !== "spellcheck_install") return;
      const { onProgress: channel } = args as {
        onProgress: { onmessage: (message: unknown) => void };
      };
      channel.onmessage({ received: 5, total: 10 });
    }) as Parameters<typeof mockIPC>[0]);

    await ipc.install("pl", onProgress);

    expect(onProgress).toHaveBeenCalledWith(5, 10);
  });
});
