import { shallowRef } from "vue";

// What modules drew for the pages (src/engine/vectors.ts): counters bumped
// when something new can be shown, which the page view and the pages follow.

// bumped whenever a picture of a drawing is ready to be painted (a
// diagram's SVG, while the diagram module hasn't drawn it)
export const vectorPictures = shallowRef(0);

// bumped whenever the diagram module drew a diagram, so the pages lay it
// out with its drawing
export const drawnVectors = shallowRef(0);
