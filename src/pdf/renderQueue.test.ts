import { describe, expect, it, vi } from "vitest";

import { type RenderJob, RenderQueue } from "./renderQueue";

const job = (page: number, priority = 0): RenderJob => ({
  key: `t|s|${page}|2`,
  slot: `t|s|${page}`,
  tab: "t",
  page,
  scale: 2,
  priority,
});

/**
 * queued returns a queue whose renders wait until `finish` settles them
 */
const queued = () => {
  // settled with the page's bitmap, or rejected with a failure
  const pending: { page: number; settle: (failure?: string) => void }[] = [];
  const renderer = {
    render: vi.fn(
      (job: RenderJob) =>
        new Promise<string>((resolve, reject) =>
          pending.push({
            page: job.page,
            settle: (failure) =>
              failure ? reject(failure) : resolve(`bitmap ${job.page}`),
          }),
        ),
    ),
    cancel: vi.fn(),
    done: vi.fn(),
  };
  const finish = async (failure?: string) => {
    pending.shift()!.settle(failure);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { queue: new RenderQueue(renderer), renderer, pending, finish };
};

describe("RenderQueue", () => {
  it("draws one page at a time, those in view first", async () => {
    const { queue, renderer, pending, finish } = queued();

    queue.want([job(3, 1), job(1, 0), job(2, 1)]);

    expect(pending.map(({ page }) => page)).toEqual([1]);
    await finish();
    expect(renderer.done).toHaveBeenCalledWith(job(1, 0), {
      bitmap: "bitmap 1",
    });
    expect(pending.map(({ page }) => page)).toEqual([3]);
  });

  it("drops what isn't wanted any more, and stops it while it is drawn", async () => {
    const { queue, renderer, pending, finish } = queued();
    queue.want([job(1), job(2, 1)]);

    queue.want([job(5)]);

    expect(renderer.cancel).toHaveBeenCalledWith(job(1), 1);
    await finish();
    expect(pending.map(({ page }) => page)).toEqual([5]);
    expect(renderer.render).not.toHaveBeenCalledWith(
      job(2, 1),
      expect.anything(),
    );
  });

  it("doesn't draw a page twice while it is being drawn", () => {
    const { queue, renderer } = queued();
    queue.want([job(1)]);

    queue.want([job(1), job(2)]);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.cancel).not.toHaveBeenCalled();
  });

  it("draws a page again that was stopped and then wanted again", async () => {
    const { queue, renderer, pending, finish } = queued();
    queue.want([job(1)]);
    queue.want([job(5)]);
    expect(renderer.cancel).toHaveBeenCalledTimes(1);

    // back before the stop came back
    queue.want([job(1), job(5)]);
    expect(renderer.cancel).toHaveBeenCalledTimes(1);
    await finish("cancelled");

    expect(renderer.done).not.toHaveBeenCalled();
    expect(pending.map(({ page }) => page)).toEqual([1]);
    await finish();
    expect(renderer.done).toHaveBeenCalledWith(job(1), { bitmap: "bitmap 1" });
    expect(pending.map(({ page }) => page)).toEqual([5]);
  });

  it("doesn't draw a page again that was drawn though asked to stop", async () => {
    const { queue, renderer, pending, finish } = queued();
    queue.want([job(1)]);
    queue.want([]);
    queue.want([job(1)]);

    await finish();

    expect(renderer.done).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(0);
  });

  it("tells a failure, but not a page it stopped", async () => {
    const { queue, renderer, finish } = queued();
    queue.want([job(1)]);
    await finish("crashed");
    expect(renderer.done).toHaveBeenCalledWith(job(1), { failure: "crashed" });

    renderer.render.mockRejectedValueOnce("cancelled");
    queue.want([job(2)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(renderer.done).toHaveBeenCalledTimes(1);
  });
});
