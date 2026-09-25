import { afterEach, vi } from "vitest";
import { clearMocks } from "@tauri-apps/api/mocks";

// There is no Tauri IPC in jsdom, so every plugin the app calls is mocked for
// all tests. `mockReset: true` resets these mocks before each test, so set
// return values inside the test (or its `beforeEach`).

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
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeTextFile: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-cli", () => ({
  getMatches: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(),
}));

afterEach(() => {
  // removes IPC handlers installed via `mockIPC` (see `src/test/tauri.ts`)
  clearMocks();
  vi.useRealTimers();
});
