import { describe, expect, it } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";

import { useBodyClass } from "./useBodyClass";

describe("useBodyClass", () => {
  it("gives the body the class while it's active, and takes it away at the end", async () => {
    const active = shallowRef(true);
    const scope = effectScope();
    scope.run(() => useBodyClass("tested", () => active.value));
    expect(document.body.classList).toContain("tested");

    active.value = false;
    await nextTick();
    expect(document.body.classList).not.toContain("tested");

    active.value = true;
    await nextTick();
    expect(document.body.classList).toContain("tested");
    scope.stop();
    expect(document.body.classList).not.toContain("tested");
  });
});
