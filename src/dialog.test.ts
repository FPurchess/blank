import { afterEach, describe, expect, it } from "vitest";

import { Observable } from "observable.ts";

import { bootDialog } from "./dialog";

const ID = "test-dialog";
const requests = new Observable<string | null>(null);
const render = (request: string) => {
  const element = document.createElement("div");
  element.id = ID;
  element.textContent = request;
  document.body.append(element);
};
const dialogs = () => document.querySelectorAll(`#${ID}`);

describe("bootDialog", () => {
  let dispose = () => {};

  afterEach(() => {
    dispose();
    requests.value = null;
    document.body.replaceChildren();
  });

  it("renders the dialog for each request and removes it when closed", () => {
    dispose = bootDialog(requests, ID, render);
    requests.value = "first";
    requests.value = "second";

    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toBe("second");

    requests.value = null;
    expect(dialogs()).toHaveLength(0);
  });

  it("renders a request that is already open when booted", () => {
    requests.value = "open";
    dispose = bootDialog(requests, ID, render);

    expect(dialogs()[0].textContent).toBe("open");
  });

  it("removes the dialog and stops rendering when disposed", () => {
    dispose = bootDialog(requests, ID, render);
    requests.value = "open";
    dispose();

    expect(dialogs()).toHaveLength(0);
    requests.value = "again";
    expect(dialogs()).toHaveLength(0);
  });

  it("replaces an earlier boot of the same dialog", () => {
    const first = bootDialog(requests, ID, render);
    dispose = bootDialog(requests, ID, render);
    requests.value = "open";

    expect(dialogs()).toHaveLength(1);
    // disposing the replaced boot leaves the newer one alone
    first();
    expect(dialogs()).toHaveLength(1);
  });
});
