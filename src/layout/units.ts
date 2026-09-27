// Lengths as people write them, "2.5cm" or "1 in", in points: the unit of
// pdfmake and, times 20, of Word.

export type Unit = "mm" | "cm" | "in" | "pt";

const POINTS: Record<Unit, number> = {
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  pt: 1,
};

// the decimals a length is written with in each unit
const DECIMALS: Record<Unit, number> = { mm: 1, cm: 2, in: 2, pt: 1 };

// a number with a dot or a comma, then the unit
const LENGTH = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|in|pt)\s*$/i;

const parse = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const match = LENGTH.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase() as Unit;
  return { amount, unit };
};

/**
 * parseLength reads a length like "2.5cm", "2,5 cm" or "1in"
 * @returns the length in points, or undefined if `value` isn't one
 */
export const parseLength = (value: unknown): number | undefined => {
  const length = parse(value);
  return length && length.amount * POINTS[length.unit];
};

/**
 * toUnit converts `points` to `unit`, rounded like people write it
 */
export const toUnit = (points: number, unit: Unit): number =>
  Number((points / POINTS[unit]).toFixed(DECIMALS[unit]));

/**
 * formatLength writes `points` in `unit`
 * @example formatLength(70.87, "cm") === "2.5cm"
 */
export const formatLength = (points: number, unit: Unit): string =>
  `${toUnit(points, unit)}${unit}`;

/**
 * paperUnit returns the unit paper sizes are given in: millimetres where
 * lengths are in centimetres, e.g. 170 × 240 mm
 */
export const paperUnit = (unit: Unit): Unit => (unit === "in" ? "in" : "mm");

// lengths that differ by less than this are the same, e.g. after a round trip
// through Word, which measures in twentieths of a point
const TOLERANCE = 0.5;

export const sameLength = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;

// images are measured in CSS pixels at 96 dpi, like in the editor
export const POINTS_PER_PIXEL = 0.75;
