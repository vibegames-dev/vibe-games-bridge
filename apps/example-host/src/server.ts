import { createServer } from "node:http";
import { createBridgePeer } from "@vibe-games-bridge/core";
import { bridgeSchema } from "@vibe-games-bridge/protocol";
import { WebSocketServer } from "ws";

const PORT = 4567;

const scripts = [
  {
    path: "scripts/playerController.ts",
    content: [
      "export function movePlayer(",
      "  direction: { x: number; y: number; z: number },",
      "  speed: number",
      ") {",
      "  // TODO: implement player movement",
      "}",
    ].join("\n"),
  },
  {
    path: "scripts/enemyAi.ts",
    content: [
      "export function updateEnemy(dt: number) {",
      "  // TODO: implement enemy AI",
      "}",
    ].join("\n"),
  },
];

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  console.log("[bridge] Client connected");

  const peer = createBridgePeer(
    bridgeSchema,
    {
      send: (data) => ws.send(data),
      onMessage: (handler) =>
        ws.on("message", (raw) => handler(raw.toString())),
    },
    { scripts, assets: [] },
  );

  peer.onRequest("script:run", async ({ path }) => {
    console.log(`[bridge] Running script: ${path}`);
    return { success: true, output: `Executed ${path}` };
  });

  // Push initial state to the client
  peer.resources.scripts.setValue(scripts);

  ws.on("close", () => {
    console.log("[bridge] Client disconnected");
  });
});

const vscodeUrl = new URL("vscode://vibe-games-bridge.vscode/open");
vscodeUrl.searchParams.set("serverUrl", `ws://localhost:${PORT}`);
vscodeUrl.searchParams.set("token", "dev");
vscodeUrl.searchParams.set("workspace", "Demo Project");

httpServer.listen(PORT, () => {
  console.log(`\nBridge server running at ws://localhost:${PORT}`);
  console.log(`\nOpen in VS Code:\n  ${vscodeUrl.toString()}\n`);
});
