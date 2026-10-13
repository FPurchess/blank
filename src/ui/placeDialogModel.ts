// What the dialog that asks where the user signs (PlaceDialog.vue) checks.

export const NO_PLACE_TYPED = "Type where you sign.";

/**
 * placeProblem says what's wrong with the place typed, "" when nothing is
 */
export const placeProblem = (place: string) =>
  place.trim() ? "" : NO_PLACE_TYPED;
