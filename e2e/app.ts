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

/**
 * profileEnv returns the environment that keeps the app's storage, config
 * and cache in the temporary profile `dir`, away from the developer's own
 */
export const profileEnv = (dir: string) => ({
  XDG_DATA_HOME: path.join(dir, "data"),
  XDG_CONFIG_HOME: path.join(dir, "config"),
  XDG_CACHE_HOME: path.join(dir, "cache"),
});
