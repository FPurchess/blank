import { onScopeDispose, watchEffect } from "vue";

/**
 * useBodyClass gives the body the class `name` while `active` returns true,
 * for styles of the whole window (e.g. room for a header), and takes it away
 * when the component that uses it goes
 */
export const useBodyClass = (name: string, active: () => boolean) => {
  watchEffect(() => document.body.classList.toggle(name, active()));
  onScopeDispose(() => document.body.classList.remove(name));
};
