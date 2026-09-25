import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// path to the debug build of the app, passed to tauri-driver via `tauri:options`
export const application =
  process.env.E2E_APP_PATH ??
  path.join(
    process.env.CARGO_TARGET_DIR ??
      path.resolve(dirname, "..", "src-tauri", "target"),
    "debug",
    "blank",
  );
