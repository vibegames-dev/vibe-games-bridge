import { describe, expect, it } from "vitest";
import { OutputChannelBridge } from "../outputChannelBridge.js";

describe("OutputChannelBridge", () => {
  it("starts empty", () => {
    const bridge = new OutputChannelBridge();
    expect(bridge.read()).toEqual([]);
  });

  it("stores appended lines", () => {
    const bridge = new OutputChannelBridge();
    bridge.appendLine("hello");
    bridge.appendLine("world");
    expect(bridge.read()).toEqual(["hello", "world"]);
  });

  it("read returns a copy", () => {
    const bridge = new OutputChannelBridge();
    bridge.appendLine("line");
    const result = bridge.read();
    result.push("injected");
    expect(bridge.read()).toEqual(["line"]);
  });
});
