import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  exists,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { vi } from "vitest";

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
 * mockTextFiles makes the mocked plugin-fs read and write text files in
 * `files`, by path, as a disk would: a rename moves a file. Call it in
 * `beforeEach`, since mocks are reset before each test.
 * @returns the files, to check what was written
 */
export const mockTextFiles = (files: Record<string, string> = {}) => {
  vi.mocked(exists).mockImplementation(async (path) =>
    Object.hasOwn(files, String(path)),
  );
  vi.mocked(readTextFile).mockImplementation(async (path) => {
    if (!Object.hasOwn(files, String(path)))
      throw new Error(`no such file: ${String(path)}`);
    return files[String(path)];
  });
  vi.mocked(writeTextFile).mockImplementation(async (path, content) => {
    files[String(path)] = content as string;
  });
  vi.mocked(rename).mockImplementation(async (from, to) => {
    files[String(to)] = files[String(from)];
    delete files[String(from)];
  });
  return files;
};
