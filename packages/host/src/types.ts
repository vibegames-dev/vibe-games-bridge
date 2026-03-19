import type {
  BridgeResourceDescriptor,
  BridgeServerMessage,
} from "@vibe-games-bridge/protocol";

export type BridgeResourceAdapter = {
  list(): Promise<BridgeResourceDescriptor[]>;
  read?(path: string): Promise<string | undefined>;
  write?(path: string, content: string): Promise<void>;
};

export type BridgeServerOptions = {
  authenticate(token: string | undefined): Promise<{ clientId: string }>;
  resources: BridgeResourceAdapter;
};

export type BridgeConnection = {
  send(message: BridgeServerMessage): void;
  onMessage(raw: string): void;
  onClose(): void;
};

export type BridgeServer = {
  connect(send: (data: string) => void): BridgeConnection;
};

