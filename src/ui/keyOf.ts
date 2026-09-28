// Vue keys are strings or numbers. keyOf gives an object one, so App.vue can
// key a part of the UI by the object that makes it the same: a dialog by its
// request (a new request, a new dialog), the context menu by its `close`
// (another request of the open menu updates it).
const keys = new WeakMap<object, number>();
let lastKey = 0;

/**
 * keyOf returns the same number for the same object, and a new one for
 * another
 */
export const keyOf = (value: object) => {
  let key = keys.get(value);
  if (key === undefined) {
    key = ++lastKey;
    keys.set(value, key);
  }
  return key;
};
