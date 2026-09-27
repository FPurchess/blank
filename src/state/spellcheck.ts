import { shallowRef } from "vue";

import type { Spellchecker, SpellcheckStatus } from "../spellcheck/types";

// spellcheck is whether spelling is checked, which the user turns on and off
export const spellcheck = shallowRef<boolean>(false);

// spellcheckStatus is what the spell checker is doing
export const spellcheckStatus = shallowRef<SpellcheckStatus>({
  state: "off",
  tag: "en",
});

// spellchecker checks the spelling while spellcheckStatus is "ready"
export const spellchecker = shallowRef<Spellchecker | null>(null);
