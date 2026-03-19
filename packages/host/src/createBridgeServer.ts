import { bridgeClientMessageSchema } from "@vibe-games-bridge/protocol";
import type { BridgeServerMessage } from "@vibe-games-bridge/protocol";
import type {
  BridgeConnection,
  BridgeServer,
  BridgeServerOptions,
} from "./types";

export const createBridgeServer = (
  options: BridgeServerOptions,
): BridgeServer => {
  const connect = (rawSend: (data: string) => void): BridgeConnection => {
    let authenticated = false;
    let closed = false;

    const send = (message: BridgeServerMessage) => {
      if (closed) return;
      rawSend(JSON.stringify(message));
    };

    const handleHello = async (
      msg: Extract<
        ReturnType<typeof bridgeClientMessageSchema.parse>,
        { kind: "hello" }
      >,
    ) => {
      try {
        const auth = await options.authenticate(msg.token);

        if (closed) return;

        authenticated = true;

        send({
          kind: "event",
          type: "session:ready",
          payload: { clientId: auth.clientId },
        });
      } catch {
        send({
          kind: "event",
          type: "session:error",
          payload: { message: "Authentication failed" },
        });
      }
    };

    const handleRequest = async (msg: {
      requestId: string;
      type: string;
      payload?: unknown;
    }) => {
      const payload = (msg.payload ?? {}) as Record<string, unknown>;

      try {
        switch (msg.type) {
          case "resource:list": {
            const entries = await options.resources.list();
            send({
              kind: "response",
              requestId: msg.requestId,
              ok: true,
              payload: { entries },
            });
            break;
          }

          case "resource:read": {
            if (!options.resources.read || !payload.path) {
              send({
                kind: "response",
                requestId: msg.requestId,
                ok: false,
                error: { code: "unsupported", message: "Read not supported" },
              });
              break;
            }
            const content = await options.resources.read(
              payload.path as string,
            );
            if (content === undefined) {
              send({
                kind: "response",
                requestId: msg.requestId,
                ok: false,
                error: {
                  code: "not-found",
                  message: `Not found: ${payload.path}`,
                },
              });
            } else {
              send({
                kind: "response",
                requestId: msg.requestId,
                ok: true,
                payload: { path: payload.path, content },
              });
            }
            break;
          }

          case "resource:write": {
            if (!options.resources.write || !payload.path) {
              send({
                kind: "response",
                requestId: msg.requestId,
                ok: false,
                error: { code: "unsupported", message: "Write not supported" },
              });
              break;
            }
            await options.resources.write(
              payload.path as string,
              payload.content as string,
            );
            send({
              kind: "response",
              requestId: msg.requestId,
              ok: true,
            });
            break;
          }

          default:
            send({
              kind: "response",
              requestId: msg.requestId,
              ok: false,
              error: {
                code: "unsupported",
                message: `Unknown request: ${msg.type}`,
              },
            });
        }
      } catch (err) {
        send({
          kind: "response",
          requestId: msg.requestId,
          ok: false,
          error: { code: "internal", message: String(err) },
        });
      }
    };

    return {
      send,

      onMessage(raw: string) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }

        const result = bridgeClientMessageSchema.safeParse(parsed);
        if (!result.success) return;

        const msg = result.data;

        if (msg.kind === "hello") {
          handleHello(msg);
          return;
        }

        if (msg.kind === "request") {
          if (!authenticated) {
            send({
              kind: "response",
              requestId: msg.requestId,
              ok: false,
              error: {
                code: "unauthorized",
                message: "Complete handshake before sending requests",
              },
            });
            return;
          }
          handleRequest(msg);
        }
      },

      onClose() {
        closed = true;
      },
    };
  };

  return { connect };
};
