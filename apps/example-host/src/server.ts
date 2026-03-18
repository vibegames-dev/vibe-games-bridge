import { createServer } from "node:http";
import { createBridgeServer } from "@vibe-games-bridge/host";
import type { BridgeConnection } from "@vibe-games-bridge/host";
import {
  bridgeClientMessageSchema,
  type BridgeResourceDescriptor,
} from "@vibe-games-bridge/protocol";
import { WebSocketServer } from "ws";

const PORT = 4567;
const PROJECT_ID = "demo";

const resources: BridgeResourceDescriptor[] = [
  {
    projectId: PROJECT_ID,
    kind: "script",
    path: "scripts/playerController.ts",
    readOnly: false,
  },
  {
    projectId: PROJECT_ID,
    kind: "script",
    path: "scripts/enemyAi.ts",
    readOnly: false,
  },
  {
    projectId: PROJECT_ID,
    kind: "material",
    path: "materials/terrain.json",
    readOnly: false,
  },
  {
    projectId: PROJECT_ID,
    kind: "scene",
    path: "scenes/main.scene.json",
    readOnly: true,
  },
];

const resourceContents: Record<string, string> = {
  "scripts/playerController.ts": [
    "export function movePlayer(",
    "  direction: { x: number; y: number; z: number },",
    "  speed: number",
    ") {",
    "  // TODO: implement player movement",
    "}",
  ].join("\n"),
  "scripts/enemyAi.ts": [
    "export function updateEnemy(dt: number) {",
    "  // TODO: implement enemy AI",
    "}",
  ].join("\n"),
  "materials/terrain.json": JSON.stringify(
    { type: "standard", color: "#4a7c59", roughness: 0.8 },
    null,
    2,
  ),
  "scenes/main.scene.json": JSON.stringify(
    { name: "Main Scene", entities: [] },
    null,
    2,
  ),
};

const resourcesAdapter = {
  async list(projectId: string): Promise<BridgeResourceDescriptor[]> {
    return resources.filter((r) => r.projectId === projectId);
  },
  async read(resource: BridgeResourceDescriptor): Promise<string | undefined> {
    return resourceContents[resource.path];
  },
};

const bridge = createBridgeServer({
  authenticateToken: async () => ({ clientId: crypto.randomUUID() }),
  resources: resourcesAdapter,
  handleRequest: async (request, context) => {
    if (request.type === "resource:list") {
      const entries = await resourcesAdapter.list(
        context.auth.projectId ?? PROJECT_ID,
      );
      return { ok: true, payload: { entries } };
    }
    return {
      ok: false,
      error: {
        code: "unsupported" as const,
        message: `Unknown request type: ${request.type}`,
      },
    };
  },
});

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const connectionId = crypto.randomUUID();
  let projectId: string | undefined;

  const connection: BridgeConnection = {
    id: connectionId,
    send(message) {
      ws.send(JSON.stringify(message));
    },
  };

  bridge.connections.add(connection);
  console.log(`[bridge] Client connected: ${connectionId}`);

  ws.on("message", async (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const result = bridgeClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("[bridge] Invalid message:", result.error.message);
      return;
    }

    const msg = result.data;

    if (msg.kind === "hello") {
      projectId = msg.projectId ?? PROJECT_ID;
      console.log(`[bridge] Hello from ${connectionId}, project: ${projectId}`);

      connection.send({
        kind: "event",
        type: "session:ready",
        payload: {
          sessionId: connectionId,
          capabilities: {
            resourceKinds: ["script", "material", "scene"],
            supportsWatch: false,
            supportsCommands: false,
            supportsDiagnostics: false,
            supportsAi: false,
          },
        },
      });
      return;
    }

    if (msg.kind === "request") {
      const auth = { clientId: connectionId, projectId: projectId ?? PROJECT_ID };
      const response = await bridge.router.handle(msg, {
        auth,
        connection,
        resources: resourcesAdapter,
      });
      ws.send(JSON.stringify(response));
    }
  });

  ws.on("close", () => {
    bridge.connections.remove(connectionId);
    console.log(`[bridge] Client disconnected: ${connectionId}`);
  });
});

const vscodeUrl = new URL("vscode://vibe-games-bridge.vscode/open");
vscodeUrl.searchParams.set("projectId", PROJECT_ID);
vscodeUrl.searchParams.set("serverUrl", `ws://localhost:${PORT}`);
vscodeUrl.searchParams.set("token", "dev");
vscodeUrl.searchParams.set("workspace", "Demo Project");

httpServer.listen(PORT, () => {
  console.log(`\nBridge server running at ws://localhost:${PORT}`);
  console.log(`\nOpen in VS Code:\n  ${vscodeUrl.toString()}\n`);
});
