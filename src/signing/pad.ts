// A drawn signature: strokes of points, each with the pen's pressure, in
// the pad's own box of PAD_WIDTH by PAD_HEIGHT, whatever size the pad was
// on the screen. Drawn as smooth curves through the midpoints, each segment
// as wide as the pressure at it.

export type Point = [x: number, y: number, pressure: number];
export type Stroke = Point[];

export const PAD_WIDTH = 1000;
export const PAD_HEIGHT = 300;
// the line written on, as a share of the pad's height from its top
export const BASELINE = 0.7;

// a mouse has no pressure; the webview says 0.5 for it while a button is down
const DEFAULT_PRESSURE = 0.5;
// the line's width in the pad's units, from the lightest to the heaviest
const THIN = 2.5;
const THICK = 7;

/**
 * pressureOf returns the pressure of a pointer event's point: the pen's, or
 * the default for a mouse or a pen that says none
 */
export const pressureOf = (pressure: number) =>
  pressure > 0 && pressure <= 1 ? pressure : DEFAULT_PRESSURE;

/**
 * widthAt returns how wide the line is at `pressure`
 */
export const widthAt = (pressure: number) =>
  THIN + (THICK - THIN) * pressureOf(pressure);

/**
 * toPad turns a point on the pad as shown, `width` by `height` pixels, into
 * the pad's own units
 */
export const toPad = (
  x: number,
  y: number,
  pressure: number,
  width: number,
  height: number,
): Point => [
  (x / Math.max(width, 1)) * PAD_WIDTH,
  (y / Math.max(height, 1)) * PAD_HEIGHT,
  pressureOf(pressure),
];

// what drawing needs of a canvas's context, so tests can record it
export interface Pen {
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
}

/**
 * drawStrokes draws `strokes` in `color`, scaled by `scale` from the pad's
 * units; a stroke of one point is a dot
 */
export const drawStrokes = (
  pen: Pen,
  strokes: readonly Stroke[],
  scale: number,
  color: string,
) => {
  pen.lineCap = "round";
  pen.lineJoin = "round";
  pen.strokeStyle = color;
  pen.fillStyle = color;
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const [x, y, pressure] = stroke[0];
      pen.beginPath();
      pen.arc(
        x * scale,
        y * scale,
        (widthAt(pressure) * scale) / 2,
        0,
        Math.PI * 2,
      );
      pen.fill();
      continue;
    }
    // each segment from one midpoint to the next, curved through the point
    // between them, so the line is smooth and each part can have its width
    for (let index = 1; index < stroke.length; index++) {
      const [x0, y0] = stroke[index - 1];
      const [x1, y1, pressure] = stroke[index];
      const before = stroke[index - 2];
      const start = before
        ? [(before[0] + x0) / 2, (before[1] + y0) / 2]
        : [x0, y0];
      const end =
        index === stroke.length - 1 ? [x1, y1] : [(x0 + x1) / 2, (y0 + y1) / 2];
      pen.beginPath();
      pen.lineWidth = widthAt(pressure) * scale;
      pen.moveTo(start[0] * scale, start[1] * scale);
      if (before)
        pen.quadraticCurveTo(
          x0 * scale,
          y0 * scale,
          end[0] * scale,
          end[1] * scale,
        );
      else pen.lineTo(end[0] * scale, end[1] * scale);
      pen.stroke();
    }
  }
};
