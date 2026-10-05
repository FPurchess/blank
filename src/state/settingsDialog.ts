import { shallowRef } from "vue";

// The sections of the settings dialog (src/ui/settings/), in their order
export const settingsSections = [
  "appearance",
  "writing",
  "spelling",
  "shortcuts",
  "about",
] as const;
export type SettingsSection = (typeof settingsSections)[number];

// the section the settings dialog showed last, which it opens on again; kept
// for the session only
export const settingsSection = shallowRef<SettingsSection>("appearance");
