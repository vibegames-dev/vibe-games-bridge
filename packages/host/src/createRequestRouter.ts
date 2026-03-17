import type {
  BridgeClientRequest,
  BridgeServerResponse,
} from "@vibe-games-bridge/protocol";

import type { BridgeHostOptions, BridgeRequestContext } from "./types";

export interface BridgeRequestRouter {
  handle(
    request: BridgeClientRequest,
    context: BridgeRequestContext,
  ): Promise<BridgeServerResponse>;
}

export function createRequestRouter(
  options: Pick<BridgeHostOptions, "handleRequest">,
): BridgeRequestRouter {
  return {
    async handle(request, context) {
      if (!options.handleRequest) {
        return {
          kind: "response",
          requestId: request.requestId,
          ok: false,
          error: {
            code: "unsupported",
            message: `No request handler registered for "${request.type}".`,
          },
        };
      }

      const result = await options.handleRequest(request, context);

      if (!result.ok) {
        return {
          kind: "response",
          requestId: request.requestId,
          ok: false,
          error: result.error,
        };
      }

      return {
        kind: "response",
        requestId: request.requestId,
        ok: true,
        payload: result.payload,
      };
    },
  };
}
