import { createServer } from "node:http";
import { createBridgeServer } from "@vibe-games-bridge/host";
import type { BridgeResourceDescriptor } from "@vibe-games-bridge/protocol";
import { WebSocketServer } from "ws";

const PORT = 4567;

const resources: BridgeResourceDescriptor[] = [
  { kind: "script", path: "scripts/playerController.ts", readOnly: false },
  { kind: "script", path: "scripts/enemyAi.ts", readOnly: false },
  { kind: "material", path: "materials/terrain.json", readOnly: false },
  { kind: "scene", path: "scenes/main.scene.json", readOnly: true },
];

const contents: Record<string, string> = {
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

const bridge = createBridgeServer({
  authenticate: async () => ({ clientId: crypto.randomUUID() }),
  resources: {
    list: async () => resources,
    read: async (path) => contents[path],
    write: async (path, content) => {
      contents[path] = content;
    },
  },
});

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const conn = bridge.connect((data) => ws.send(data));
  ws.on("message", (raw) => conn.onMessage(raw.toString()));
  ws.on("close", () => conn.onClose());
  console.log("[bridge] Client connected");
});

const vscodeUrl = new URL("vscode://vibe-games-bridge.vscode/open");
vscodeUrl.searchParams.set("serverUrl", `ws://localhost:${PORT}`);
vscodeUrl.searchParams.set("token", "dev");
vscodeUrl.searchParams.set("workspace", "Demo Project");

httpServer.listen(PORT, () => {
  console.log(`\nBridge server running at ws://localhost:${PORT}`);
  console.log(`\nOpen in VS Code:\n  ${vscodeUrl.toString()}\n`);
});
