/**
 * errorMessage turns a caught value into readable text. JSON.stringify alone
 * prints "{}" for an Error, since its message is not an own enumerable property.
 * @param err caught value, e.g. an Error or the string a Tauri plugin rejects with
 * @returns message
 */
export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    // undefined and functions stringify to undefined, circular objects throw
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
};
