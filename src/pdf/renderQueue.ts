import { failureOf, type PdfFailure } from "./ipc";

// The pages a PDF tab asks its helper to draw, one at a time: the helper
// draws one page at a time anyway (MuPDF), so a request waits here, where
// the page view can still change its mind. The pages in view go first, and
// a page that leaves the pages kept near the view is dropped, or stopped
// while it is being drawn.

// a page to draw: the bitmap `key` of `page` at `scale` of the tab `tab`,
// which takes the place of what `slot` held (see BitmapCache)
export interface RenderJob {
  key: string;
  slot: string;
  tab: string;
  page: number;
  scale: number;
  // lower first: the pages in view before those near it
  priority: number;
}

export type RenderResult<T> = { bitmap: T } | { failure: PdfFailure };

export interface Renderer<T> {
  render(job: RenderJob, ticket: number): Promise<T>;
  cancel(job: RenderJob, ticket: number): void;
  // a job that ran, or failed; one that was dropped or stopped says nothing
  done(job: RenderJob, result: RenderResult<T>): void;
}

// the page being drawn, and whether it was asked to stop
interface Running {
  job: RenderJob;
  ticket: number;
  cancelled: boolean;
}

export class RenderQueue<T> {
  private wanted = new Map<string, RenderJob>();
  private running: Running | null = null;
  private tickets = 0;

  constructor(private renderer: Renderer<T>) {}

  /**
   * want makes `jobs` the pages to draw: the others waiting are dropped, and
   * the one being drawn is stopped unless it's among them
   */
  want(jobs: readonly RenderJob[]) {
    this.wanted = new Map(jobs.map((job) => [job.key, job]));
    const running = this.running;
    if (running && !running.cancelled) {
      if (this.wanted.has(running.job.key)) this.wanted.delete(running.job.key);
      else {
        running.cancelled = true;
        this.renderer.cancel(running.job, running.ticket);
      }
    }
    // one stopped already but wanted again stays wanted: it is drawn again
    // once the stop comes back
    this.next();
  }

  /**
   * stop drops every page waiting and stops the one being drawn
   */
  stop() {
    this.want([]);
  }

  private next() {
    if (this.running || this.wanted.size === 0) return;
    const job = [...this.wanted.values()].reduce((first, other) =>
      other.priority < first.priority ? other : first,
    );
    this.wanted.delete(job.key);
    const running = { job, ticket: ++this.tickets, cancelled: false };
    this.running = running;
    this.renderer.render(job, running.ticket).then(
      (bitmap) => this.finish(running, { bitmap }),
      (error) => this.finish(running, { failure: failureOf(error) }),
    );
  }

  private finish(running: Running, result: RenderResult<T>) {
    this.running = null;
    if (!("failure" in result) || result.failure !== "cancelled") {
      this.renderer.done(running.job, result);
      // drawn after all, though asked to stop: not again
      this.wanted.delete(running.job.key);
    }
    this.next();
  }
}
