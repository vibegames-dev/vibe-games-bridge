import {
  type BridgeBroadcastHub,
  createBroadcastHub,
} from "./createBroadcastHub";
import {
  type BridgeConnectionManager,
  createConnectionManager,
} from "./createConnectionManager";
import {
  type BridgeRequestRouter,
  createRequestRouter,
} from "./createRequestRouter";
import type { BridgeHostOptions } from "./types";

export interface BridgeServer {
  broadcastHub: BridgeBroadcastHub;
  connections: BridgeConnectionManager;
  router: BridgeRequestRouter;
}

export function createBridgeServer(options: BridgeHostOptions): BridgeServer {
  return {
    broadcastHub: createBroadcastHub(),
    connections: createConnectionManager(),
    router: createRequestRouter(options),
  };
}
