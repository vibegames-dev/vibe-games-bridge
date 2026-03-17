import type { BridgeConnection } from "./types";

export interface BridgeConnectionManager {
  add(connection: BridgeConnection): void;
  get(connectionId: string): BridgeConnection | undefined;
  remove(connectionId: string): void;
  list(): BridgeConnection[];
}

export function createConnectionManager(): BridgeConnectionManager {
  const connections = new Map<string, BridgeConnection>();

  return {
    add(connection) {
      connections.set(connection.id, connection);
    },
    get(connectionId) {
      return connections.get(connectionId);
    },
    remove(connectionId) {
      connections.delete(connectionId);
    },
    list() {
      return [...connections.values()];
    },
  };
}
