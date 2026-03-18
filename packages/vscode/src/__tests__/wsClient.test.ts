import { describe, expect, it, vi } from "vitest";
import { BridgeWsClient } from "../wsClient.js";

vi.mock("ws", () => {
  const MockWebSocket = vi.fn(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  }));
  return { default: MockWebSocket };
});

describe("BridgeWsClient", () => {
  it("starts idle", () => {
    const client = new BridgeWsClient("ws://localhost:3000");
    expect(client.getStatus()).toBe("idle");
  });

  it("transitions to connecting on connect()", () => {
    const client = new BridgeWsClient("ws://localhost:3000");
    client.connect({});
    expect(client.getStatus()).toBe("connecting");
  });

  it("transitions to closed on close()", () => {
    const client = new BridgeWsClient("ws://localhost:3000");
    client.close();
    expect(client.getStatus()).toBe("closed");
  });
});
