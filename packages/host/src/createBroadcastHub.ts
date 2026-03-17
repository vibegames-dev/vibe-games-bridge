import type { BridgeServerMessage } from "@vibe-games-bridge/protocol";

import type { BridgeConnection } from "./types";

export interface BridgeBroadcastHub {
  subscribe(projectId: string, connection: BridgeConnection): void;
  unsubscribe(projectId: string, connectionId: string): void;
  publish(projectId: string, message: BridgeServerMessage): void;
}

export function createBroadcastHub(): BridgeBroadcastHub {
  const rooms = new Map<string, Map<string, BridgeConnection>>();

  return {
    subscribe(projectId, connection) {
      const room = rooms.get(projectId) ?? new Map<string, BridgeConnection>();
      room.set(connection.id, connection);
      rooms.set(projectId, room);
    },
    unsubscribe(projectId, connectionId) {
      const room = rooms.get(projectId);

      if (!room) {
        return;
      }

      room.delete(connectionId);

      if (room.size === 0) {
        rooms.delete(projectId);
      }
    },
    publish(projectId, message) {
      const room = rooms.get(projectId);

      if (!room) {
        return;
      }

      for (const connection of room.values()) {
        connection.send(message);
      }
    },
  };
}
