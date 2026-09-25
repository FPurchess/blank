import { vi } from "vitest";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { getMatches } from "@tauri-apps/plugin-cli";

/**
 * mockTauriPath answers the IPC calls behind `path` from `@tauri-apps/api`:
 * `resolve` returns its input, `join` joins with "/" and every base directory
 * (e.g. `appConfigDir`) resolves to `appConfigDir`.
 * Call it in `beforeEach`: the global `afterEach` clears IPC mocks.
 */
export const mockTauriPath = ({ appConfigDir = "/config" } = {}) => {
  const handler = async (cmd: string, args?: InvokeArgs) => {
    const { paths } = (args ?? {}) as { paths?: string[] };
    switch (cmd) {
      case "plugin:path|resolve":
      case "plugin:path|join":
        return paths?.join("/");
      case "plugin:path|resolve_directory":
        return appConfigDir;
    }
  };
  // mockIPC is typed with a generic result, which a real handler can't satisfy
  mockIPC(handler as Parameters<typeof mockIPC>[0]);
};

/**
 * mockCliArgs makes `getMatches` report the given `path` argument
 * (or no arguments at all).
 */
export const mockCliArgs = (path?: string) => {
  vi.mocked(getMatches).mockResolvedValue({
    args: path ? { path: { value: path, occurrences: 1 } } : {},
    subcommand: null,
  });
};
