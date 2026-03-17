export type BridgeClientStatus = "idle" | "connecting" | "connected" | "closed";

export class BridgeWsClient {
  readonly serverUrl: string;
  private status: BridgeClientStatus = "idle";

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  getStatus(): BridgeClientStatus {
    return this.status;
  }

  connect(): void {
    this.status = "connecting";
  }

  close(): void {
    this.status = "closed";
  }
}
