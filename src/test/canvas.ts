// jsdom has no canvas: getContext returns null and warns, and there is no
// Path2D. The setup puts a context in its place that records what is
// painted, so the page view paints in tests too.

const records = new WeakMap<HTMLCanvasElement, unknown[][]>();
const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

/**
 * recordingContext returns a 2D context of `canvas` that records every
 * call that paints, as [name, ...arguments]
 */
export const recordingContext = (
  canvas: { width: number; height: number },
  calls: unknown[][] = [],
) => {
  const context = {
    canvas,
    globalAlpha: 1,
    fillStyle: "",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    setTransform: (...args: number[]) => calls.push(["transform", ...args]),
    clearRect: (...args: number[]) => calls.push(["clear", ...args]),
    fillRect: (...args: number[]) => {
      calls.push(["rect", ...args]);
      // in what it was painted, for the tests of colours and roles
      calls.push(["style", context.fillStyle, context.globalAlpha]);
    },
    drawImage: (image: unknown, ...args: number[]) =>
      calls.push(["image", image, ...args]),
    fill: (path: unknown, rule?: string) => {
      calls.push(rule ? ["fill", path, rule] : ["fill", path]);
      calls.push(["style", context.fillStyle, context.globalAlpha]);
    },
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    dash: [] as number[],
    setLineDash: (dash: number[]) => {
      context.dash = dash;
    },
    stroke: (path: unknown) =>
      calls.push([
        "stroke",
        path,
        context.strokeStyle,
        context.lineWidth,
        context.lineCap,
        context.lineJoin,
        [...context.dash],
        context.lineDashOffset,
        context.globalAlpha,
      ]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    rect: (...args: number[]) => calls.push(["clipRect", ...args]),
    clip: () => calls.push(["clip"]),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
};

/**
 * paintCalls returns what was painted into `canvas` so far
 */
export const paintCalls = (canvas: HTMLCanvasElement) =>
  records.get(canvas) ?? [];

/**
 * installCanvasStub makes canvases give a recording 2D context, and adds a
 * Path2D that keeps its path
 */
export const installCanvasStub = () => {
  // tests of their own environment, e.g. node, have no canvas
  if (typeof HTMLCanvasElement === "undefined") return;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type !== "2d") return null;
    let context = contexts.get(this);
    if (!context) {
      const calls: unknown[][] = [];
      records.set(this, calls);
      context = recordingContext(this, calls).context;
      contexts.set(this, context);
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;
  // setting a canvas' size clears it, and what was painted into it
  for (const size of ["width", "height"] as const) {
    const own = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      size,
    );
    if (!own?.set || !own.get) continue;
    Object.defineProperty(HTMLCanvasElement.prototype, size, {
      configurable: true,
      get(this: HTMLCanvasElement) {
        return own.get!.call(this);
      },
      set(this: HTMLCanvasElement, value: number) {
        own.set!.call(this, value);
        records.get(this)?.splice(0);
      },
    });
  }
  globalThis.Path2D ??= class {
    constructor(readonly d?: string) {}
  } as unknown as typeof Path2D;
};
