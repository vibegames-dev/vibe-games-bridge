import {
  bridgeServerMessageSchema,
  type BridgeClientMessage,
  type BridgeServerMessage,
} from "@vibe-games-bridge/protocol";
import WebSocket from "ws";

export type BridgeClientStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

export interface BridgeClientCallbacks {
  onStatusChange?: (status: BridgeClientStatus) => void;
  onMessage?: (message: BridgeServerMessage) => void;
}

export class BridgeWsClient {
  readonly serverUrl: string;
  private status: BridgeClientStatus = "idle";
  private ws: WebSocket | null = null;
  private callbacks: BridgeClientCallbacks = {};

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  getStatus(): BridgeClientStatus {
    return this.status;
  }

  connect(callbacks: BridgeClientCallbacks): void {
    this.callbacks = callbacks;
    this.setStatus("connecting");

    this.ws = new WebSocket(this.serverUrl);

    this.ws.on("open", () => {
      this.setStatus("connected");
    });

    this.ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const result = bridgeServerMessageSchema.safeParse(parsed);
        if (result.success) {
          this.callbacks.onMessage?.(result.data);
        }
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      this.setStatus("closed");
    });

    this.ws.on("error", () => {
      this.setStatus("error");
    });
  }

  send(message: BridgeClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.setStatus("closed");
  }

  private setStatus(status: BridgeClientStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }
}
