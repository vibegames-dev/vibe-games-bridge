import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBridgePeer, defineBridgeSchema, type Transport } from "./bridge";

const testSchema = defineBridgeSchema({
  resources: {
    counter: z.number(),
    label: z.string(),
    items: z.record(z.string(), z.object({ value: z.string() })),
  },
  events: {
    ping: z.object({ ts: z.number() }),
  },
  requests: {
    add: {
      params: z.object({ a: z.number(), b: z.number() }),
      result: z.object({ sum: z.number() }),
    },
  },
});

function createMockTransport(): Transport & {
  simulateIncoming: (msg: unknown) => void;
  sent: unknown[];
} {
  let handler: ((data: string) => void) | null = null;
  const sent: unknown[] = [];
  return {
    send(data: string) {
      sent.push(JSON.parse(data));
    },
    onMessage(h) {
      handler = h;
    },
    simulateIncoming(msg: unknown) {
      handler?.(JSON.stringify(msg));
    },
    sent,
  };
}

const defaults = () => ({ counter: 0, label: "", items: {} });

describe("createBridgePeer", () => {
  describe("resources", () => {
    it("initializes resources with provided values", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        counter: 0,
        label: "hello",
        items: {},
      });

      expect(peer.resources.counter.getValue()).toBe(0);
      expect(peer.resources.label.getValue()).toBe("hello");
    });

    it("sends resource:update over wire when resource changes locally", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      peer.resources.counter.setValue(5);

      expect(transport.sent).toContainEqual({
        kind: "resource:update",
        key: "counter",
        data: 5,
      });
    });

    it("updates resource when receiving resource:update from wire", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      transport.simulateIncoming({
        kind: "resource:update",
        key: "counter",
        data: 42,
      });

      expect(peer.resources.counter.getValue()).toBe(42);
    });

    it("does not echo resource:update back to wire (no infinite loop)", () => {
      const transport = createMockTransport();
      createBridgePeer(testSchema, transport, defaults());

      const sentBefore = transport.sent.length;
      transport.simulateIncoming({
        kind: "resource:update",
        key: "counter",
        data: 10,
      });

      expect(transport.sent.length).toBe(sentBefore);
    });
  });

  describe("resource keyed operations", () => {
    it("setKey sends resource:key-set with only the changed entry", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old" } },
      });

      peer.resources.items.setKey("a", { value: "new" });

      expect(transport.sent).toContainEqual({
        kind: "resource:key-set",
        key: "items",
        entryKey: "a",
        data: { value: "new" },
      });
    });

    it("setKey does not send a full resource:update", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old" } },
      });

      const sentBefore = transport.sent.length;
      peer.resources.items.setKey("a", { value: "new" });

      const fullUpdates = transport.sent
        .slice(sentBefore)
        .filter(
          (m) => (m as Record<string, unknown>).kind === "resource:update",
        );
      expect(fullUpdates).toHaveLength(0);
    });

    it("setKey updates local value correctly", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old-a" }, b: { value: "old-b" } },
      });

      peer.resources.items.setKey("b", { value: "new-b" });

      expect(peer.resources.items.getValue()).toEqual({
        a: { value: "old-a" },
        b: { value: "new-b" },
      });
    });

    it("setKey notifies subscribers", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old" } },
      });

      const listener = vi.fn();
      peer.resources.items.subscribe(listener);

      peer.resources.items.setKey("a", { value: "new" });

      expect(listener).toHaveBeenCalledWith({ a: { value: "new" } });
    });

    it("setKey can add a new entry", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "a" } },
      });

      peer.resources.items.setKey("b", { value: "b" });

      expect(peer.resources.items.getValue()).toEqual({
        a: { value: "a" },
        b: { value: "b" },
      });
    });

    it("deleteKey sends resource:key-delete", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "a" }, b: { value: "b" } },
      });

      peer.resources.items.deleteKey("a");

      expect(transport.sent).toContainEqual({
        kind: "resource:key-delete",
        key: "items",
        entryKey: "a",
      });
    });

    it("deleteKey removes the entry locally", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "a" }, b: { value: "b" } },
      });

      peer.resources.items.deleteKey("a");

      expect(peer.resources.items.getValue()).toEqual({
        b: { value: "b" },
      });
    });

    it("handles incoming resource:key-set from wire", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old" } },
      });

      transport.simulateIncoming({
        kind: "resource:key-set",
        key: "items",
        entryKey: "a",
        data: { value: "patched" },
      });

      expect(peer.resources.items.getValue()).toEqual({
        a: { value: "patched" },
      });
    });

    it("handles incoming resource:key-delete from wire", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "a" }, b: { value: "b" } },
      });

      transport.simulateIncoming({
        kind: "resource:key-delete",
        key: "items",
        entryKey: "a",
      });

      expect(peer.resources.items.getValue()).toEqual({
        b: { value: "b" },
      });
    });

    it("does not echo resource:key-set back to wire", () => {
      const transport = createMockTransport();
      createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "old" } },
      });

      const sentBefore = transport.sent.length;
      transport.simulateIncoming({
        kind: "resource:key-set",
        key: "items",
        entryKey: "a",
        data: { value: "patched" },
      });

      expect(transport.sent.length).toBe(sentBefore);
    });

    it("does not echo resource:key-delete back to wire", () => {
      const transport = createMockTransport();
      createBridgePeer(testSchema, transport, {
        ...defaults(),
        items: { a: { value: "a" } },
      });

      const sentBefore = transport.sent.length;
      transport.simulateIncoming({
        kind: "resource:key-delete",
        key: "items",
        entryKey: "a",
      });

      expect(transport.sent.length).toBe(sentBefore);
    });
  });

  describe("events", () => {
    it("sends events over wire via emit", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      peer.emit("ping", { ts: 123 });

      expect(transport.sent).toContainEqual({
        kind: "event",
        type: "ping",
        payload: { ts: 123 },
      });
    });

    it("delivers incoming events to registered listeners", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      const listener = vi.fn();
      peer.on("ping", listener);

      transport.simulateIncoming({
        kind: "event",
        type: "ping",
        payload: { ts: 456 },
      });

      expect(listener).toHaveBeenCalledWith({ ts: 456 });
    });

    it("supports multiple listeners for the same event", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      peer.on("ping", listener1);
      peer.on("ping", listener2);

      transport.simulateIncoming({
        kind: "event",
        type: "ping",
        payload: { ts: 1 },
      });

      expect(listener1).toHaveBeenCalledWith({ ts: 1 });
      expect(listener2).toHaveBeenCalledWith({ ts: 1 });
    });
  });

  describe("requests", () => {
    it("sends request over wire and resolves on response", async () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      const promise = peer.request("add", { a: 2, b: 3 });

      const sentReq = transport.sent.find(
        (m) => (m as Record<string, unknown>).kind === "request",
      ) as Record<string, unknown>;
      expect(sentReq).toBeDefined();
      expect(sentReq.type).toBe("add");
      expect(sentReq.params).toEqual({ a: 2, b: 3 });

      transport.simulateIncoming({
        kind: "response",
        id: sentReq.id,
        result: { sum: 5 },
      });

      const result = await promise;
      expect(result).toEqual({ sum: 5 });
    });

    it("rejects on error response", async () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      const promise = peer.request("add", { a: 1, b: 1 });
      const sentReq = transport.sent.find(
        (m) => (m as Record<string, unknown>).kind === "request",
      ) as Record<string, unknown>;

      transport.simulateIncoming({
        kind: "response",
        id: sentReq.id,
        error: "something went wrong",
      });

      await expect(promise).rejects.toThrow("something went wrong");
    });

    it("handles incoming requests via onRequest", async () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      peer.onRequest("add", async (params) => ({
        sum: params.a + params.b,
      }));

      transport.simulateIncoming({
        kind: "request",
        id: "req-1",
        type: "add",
        params: { a: 10, b: 20 },
      });

      await vi.waitFor(() => {
        expect(transport.sent).toContainEqual({
          kind: "response",
          id: "req-1",
          result: { sum: 30 },
        });
      });
    });

    it("sends error response when handler throws", async () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      peer.onRequest("add", async () => {
        throw new Error("handler failed");
      });

      transport.simulateIncoming({
        kind: "request",
        id: "req-2",
        type: "add",
        params: { a: 0, b: 0 },
      });

      await vi.waitFor(() => {
        expect(transport.sent).toContainEqual({
          kind: "response",
          id: "req-2",
          error: "Error: handler failed",
        });
      });
    });

    it("sends error response when no handler is registered", async () => {
      const transport = createMockTransport();
      createBridgePeer(testSchema, transport, defaults());

      transport.simulateIncoming({
        kind: "request",
        id: "req-3",
        type: "add",
        params: { a: 0, b: 0 },
      });

      expect(transport.sent).toContainEqual({
        kind: "response",
        id: "req-3",
        error: "No handler for: add",
      });
    });
  });

  describe("wire protocol edge cases", () => {
    it("ignores malformed JSON messages", () => {
      const transport = createMockTransport();
      const peer = createBridgePeer(testSchema, transport, defaults());

      transport.simulateIncoming("not valid json" as unknown);
      expect(peer.resources.counter.getValue()).toBe(0);
    });
  });
});
