export const bridgeCommandIds = {
  openWorkspace: "vibeGamesBridge.openWorkspace",
  reconnect: "vibeGamesBridge.reconnect",
} as const;

export type BridgeCommandId =
  (typeof bridgeCommandIds)[keyof typeof bridgeCommandIds];
