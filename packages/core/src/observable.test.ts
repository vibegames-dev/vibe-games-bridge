import { describe, expect, it, vi } from "vitest";
import { Observable } from "./observable";

describe("Observable", () => {
  it("stores and returns the initial value", () => {
    const obs = new Observable(42);
    expect(obs.getValue()).toBe(42);
  });

  it("updates value via setValue", () => {
    const obs = new Observable("hello");
    obs.setValue("world");
    expect(obs.getValue()).toBe("world");
  });

  it("notifies subscribers on setValue", () => {
    const obs = new Observable(0);
    const listener = vi.fn();
    obs.subscribe(listener);

    obs.setValue(1);
    obs.setValue(2);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 1);
    expect(listener).toHaveBeenNthCalledWith(2, 2);
  });

  it("supports multiple subscribers", () => {
    const obs = new Observable("a");
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    obs.subscribe(listener1);
    obs.subscribe(listener2);

    obs.setValue("b");

    expect(listener1).toHaveBeenCalledWith("b");
    expect(listener2).toHaveBeenCalledWith("b");
  });

  it("unsubscribes when calling the returned function", () => {
    const obs = new Observable(0);
    const listener = vi.fn();
    const unsubscribe = obs.subscribe(listener);

    obs.setValue(1);
    unsubscribe();
    obs.setValue(2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it("only removes the specific unsubscribed listener", () => {
    const obs = new Observable(0);
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = obs.subscribe(listener1);
    obs.subscribe(listener2);

    unsub1();
    obs.setValue(1);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith(1);
  });

  it("does not notify subscribers on setValueWithoutNotify", () => {
    const obs = new Observable(0);
    const listener = vi.fn();
    obs.subscribe(listener);

    obs.setValueWithoutNotify(99);

    expect(obs.getValue()).toBe(99);
    expect(listener).not.toHaveBeenCalled();
  });

  it("works with complex object values", () => {
    const obs = new Observable({ name: "Alice", age: 30 });
    const listener = vi.fn();
    obs.subscribe(listener);

    const newVal = { name: "Bob", age: 25 };
    obs.setValue(newVal);

    expect(obs.getValue()).toEqual(newVal);
    expect(listener).toHaveBeenCalledWith(newVal);
  });
});
