import { shallowRef } from "vue";

// The sections of the settings dialog (src/ui/settings/, SECTIONS there)
export type SettingsSection =
  "appearance" | "writing" | "spelling" | "shortcuts" | "about";

// the section the settings dialog showed last, which it opens on again; kept
// for the session only
export const settingsSection = shallowRef<SettingsSection>("appearance");
