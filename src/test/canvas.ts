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
    fillRect: (...args: number[]) => calls.push(["rect", ...args]),
    drawImage: (image: unknown, ...args: number[]) =>
      calls.push(["image", image, ...args]),
    fill: (path: unknown) => calls.push(["fill", path]),
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
  globalThis.Path2D ??= class {
    constructor(readonly d?: string) {}
  } as unknown as typeof Path2D;
};
