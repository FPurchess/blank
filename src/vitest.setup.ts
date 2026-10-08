import { afterEach, vi } from "vitest";
import { clearMocks } from "@tauri-apps/api/mocks";

import { installCanvasStub } from "./test/canvas";

// There is no Tauri IPC in jsdom, so every plugin the app calls is mocked for
// all tests. `mockReset: true` resets these mocks before each test, so set
// return values inside the test (or its `beforeEach`).

// canvases record what is painted, see src/test/canvas.ts
installCanvasStub();

vi.mock("@tauri-apps/plugin-notification", async (importOriginal) => {
  const actual = (await importOriginal()) as unknown as object;
  return {
    ...actual,
    sendNotification: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-fs", async (importOriginal) => {
  const actual = (await importOriginal()) as unknown as object;
  return {
    ...actual,
    exists: vi.fn(),
    readFile: vi.fn(),
    readDir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    readTextFile: vi.fn(),
    rename: vi.fn(),
    writeFile: vi.fn(),
    writeTextFile: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

afterEach(() => {
  // removes IPC handlers installed via `mockIPC` (see `src/test/tauri.ts`)
  clearMocks();
  vi.useRealTimers();
});
