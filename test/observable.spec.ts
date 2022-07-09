import { assert, describe, expect, it, vi } from "vitest";
import {
  debounce,
  DebouncedObservable,
  Observable,
} from "../src/utils/observable";

describe("debounce", () => {
  it("triggers exactly once", () => {
    vi.useFakeTimers();

    let triggered = 0;
    const fn = debounce(() => triggered++, 10);
    fn();
    fn();
    vi.runAllTimers();

    assert.equal(triggered, 1);
  });
});

describe("Observable", () => {
  it("sets and gets values correctly", () => {
    const observable = new Observable(5);
    assert.equal(observable.value, 5);

    observable.value = 1;
    assert.equal(observable.value, 1);
  });

  it("notifies correctly", () => {
    let notifiedValue = 0;
    const observable = new Observable(0);
    observable.subscribe((value) => (notifiedValue = value));
    observable.value = 1;
    assert.equal(notifiedValue, 1);
    assert.equal(notifiedValue, observable.value);
  });

  it("unsubscribes correctly", () => {
    let notified = false;
    const observable = new Observable(0);
    const unsubscribe = observable.subscribe(() => (notified = true));
    unsubscribe();
    observable.value = 1;
    assert.equal(notified, false);
  });

  it("supports arrays", () => {
    const observable = new Observable(new Array<int>());
    assert.equal(observable.value.length, 0);

    // set up notifier
    let notifies = 0;
    observable.subscribe(() => notifies++);

    // push
    observable.value.push(1);
    observable.value.push(2);
    observable.value.push(3);
    assert.equal(notifies, 3);
    assert.equal(observable.value.length, 3);

    // pop
    notifies = 0;
    observable.value.pop();
    assert.equal(notifies, 1);
    assert.equal(observable.value.length, 2);

    // shift
    notifies = 0;
    const first = observable.value.shift();
    assert.equal(notifies, 1);
    assert.equal(observable.value.length, 1);
    assert.equal(first, 1);

    // unshift
    notifies = 0;
    const newLength = observable.value.unshift(first);
    assert.equal(notifies, 1);
    assert.equal(observable.value.length, newLength);
    assert.equal(newLength, 2);

    // splice
    notifies = 0;
    const deletedElements = observable.value.splice(0, 1);
    assert.equal(notifies, 1);
    assert.equal(deletedElements.length, 1);
    assert.equal(observable.value.length, 1);

    // sort
    observable.value.unshift(5, 3);

    notifies = 0;
    observable.value.sort();
    assert.equal(notifies, 1);
    assert.equal(observable.value[2], 5);

    // reverse
    notifies = 0;
    observable.value.reverse();
    assert.equal(notifies, 1);
    assert.equal(observable.value[0], 5);

    // set array and make sure it's reactive
    notifies = 0;
    observable.value = [0];
    assert.isDefined(observable.value.__ob__);
    assert.equal(notifies, 1);
    observable.value.push(1);
    assert.equal(notifies, 2);
  });
});

describe("DebouncedObservable", () => {
  it("notifies debounced", () => {
    vi.useFakeTimers();

    let notifiedValue = 0;
    const observable = new DebouncedObservable(0, 10);
    observable.subscribe((value) => (notifiedValue = value));
    observable.value = 3;
    observable.value = 2;
    observable.value = 1;

    vi.runAllTimers();

    assert.equal(notifiedValue, 1);
    assert.equal(observable.value, 1);
  });
});
