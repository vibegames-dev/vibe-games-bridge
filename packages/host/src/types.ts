import type {
  BridgeClientRequest,
  BridgeError,
  BridgeResourceDescriptor,
  BridgeServerMessage,
} from "@vibe-games-bridge/protocol";

export interface BridgeAuthContext {
  clientId: string;
  projectId?: string;
  subject?: string;
}

export interface BridgeConnection {
  id: string;
  projectId?: string;
  send(message: BridgeServerMessage): void;
}

export interface BridgeResourceAdapter {
  list(projectId: string): Promise<BridgeResourceDescriptor[]>;
  read?(resource: BridgeResourceDescriptor): Promise<string | undefined>;
  write?(resource: BridgeResourceDescriptor, contents: string): Promise<void>;
}

export interface BridgeRequestContext {
  auth: BridgeAuthContext;
  connection: BridgeConnection;
  resources: BridgeResourceAdapter;
}

export type BridgeRequestHandlerResult =
  | { ok: true; payload?: unknown }
  | { ok: false; error: BridgeError };

export type BridgeRequestHandler = (
  request: BridgeClientRequest,
  context: BridgeRequestContext,
) => Promise<BridgeRequestHandlerResult>;

export interface BridgeHostOptions {
  authenticateToken(token: string | undefined): Promise<BridgeAuthContext>;
  resources: BridgeResourceAdapter;
  handleRequest?: BridgeRequestHandler;
}
