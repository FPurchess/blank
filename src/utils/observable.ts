export const debounce = (fn: Function, ms: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

const patchArrayWithObservable = (array: Array, observable: Observable) => {
  if (array.__ob__ === undefined) {
    array.__ob__ = observable;
    ["push", "pop", "shift", "unshift", "splice", "sort", "reverse"].forEach(
      (methodName) => {
        const method: Function = array[methodName];
        array[methodName] = (...args) => {
          const result = method.call(array, ...args);
          array.__ob__.notify(array);
          return result;
        };
      }
    );
  }
  return array;
};

export class Observable<T> {
  protected observers: ((state: T) => void)[] = [];
  protected state: T;

  public constructor(state: T) {
    if (Array.isArray(state)) {
      this.state = patchArrayWithObservable(state, this);
    } else {
      this.state = state;
    }
  }

  public get value() {
    return this.state;
  }

  public set value(state: T) {
    if (Array.isArray(state)) {
      this.state = patchArrayWithObservable(state, this);
    } else {
      this.state = state;
    }
    this.notify(state);
  }

  protected notify(state: T) {
    for (const observer of this.observers) {
      observer(state);
    }
  }

  public subscribe(
    observer: (state: T) => void,
    options = { immediate: false }
  ): () => void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
      if (options.immediate) {
        observer(this.value);
      }
    }
    return () => this.unsubscribe(observer);
  }

  public unsubscribe(observer: (state: T) => void) {
    const observerIndex = this.observers.indexOf(observer);
    if (observerIndex > -1) {
      this.observers.splice(observerIndex, 1);
    }
  }
}

export class DebouncedObservable<T> extends Observable<T> {
  public constructor(state: T, milliseconds: number) {
    super(state);
    this.notify = debounce(this.notify, milliseconds);
  }
}
