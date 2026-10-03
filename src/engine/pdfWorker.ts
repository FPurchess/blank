import init, { LayoutEngine } from "./wasm/blank_layout.js";
import wasmUrl from "./wasm/blank_layout_bg.wasm?url";
import { type PdfJob, type PdfResult, writePdf } from "./pdfJob";
import { errorMessage } from "../errors";

// The worker the PDF export runs in once the page view's wasm trapped: it
// loads a wasm instance of its own, writes one PDF and is then terminated.

export type PdfReply = { result: PdfResult } | { error: string };

let loading: Promise<unknown> | null = null;

/**
 * handleJob writes the PDF of a job and replies with it, or with the error
 */
export const handleJob = async (
  job: PdfJob,
  reply: (message: PdfReply, transfer: Transferable[]) => void,
) => {
  try {
    loading ??= init({ module_or_path: wasmUrl });
    await loading;
    const result = writePdf(LayoutEngine, job);
    reply({ result }, [result.pdf.buffer]);
  } catch (error) {
    reply({ error: errorMessage(error) }, []);
  }
};

// the worker's scope, which the DOM's types don't describe
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PdfJob>) => void) | null;
  postMessage: (message: PdfReply, transfer: Transferable[]) => void;
};

scope.onmessage = (event) => {
  void handleJob(event.data, (message, transfer) =>
    scope.postMessage(message, transfer),
  );
};
