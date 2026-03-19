import { createBridgePeer } from "@vibe-games-bridge/core";
import { bridgeSchema } from "@vibe-games-bridge/protocol";
import * as vscode from "vscode";
import { type WebSocket, WebSocketServer } from "ws";
import { BridgeFileSystemProvider } from "./fileSystemProvider";

const PORT = 4567;
const FS_SCHEME = "vibe-games";

let wss: WebSocketServer | undefined;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
const fsProvider = new BridgeFileSystemProvider();

export const activate = (context: vscode.ExtensionContext): void => {
  outputChannel = vscode.window.createOutputChannel("Vibe Games Bridge");

  const fsRegistration = vscode.workspace.registerFileSystemProvider(
    FS_SCHEME,
    fsProvider,
    { isCaseSensitive: true },
  );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  );
  statusBarItem.command = "vibeGamesBridge.reconnect";
  setStatusBar("waiting");
  statusBarItem.show();

  startServer();

  const reconnectCmd = vscode.commands.registerCommand(
    "vibeGamesBridge.reconnect",
    () => {
      wss?.close();
      startServer();
    },
  );

  context.subscriptions.push(statusBarItem, fsRegistration, reconnectCmd, {
    dispose: () => {
      outputChannel.dispose();
      wss?.close();
    },
  });
};

const startServer = (): void => {
  wss = new WebSocketServer({ port: PORT });

  wss.on("listening", () => {
    setStatusBar("waiting");
    outputChannel.appendLine(`[bridge] Listening on ws://localhost:${PORT}`);
  });

  wss.on("connection", (ws: WebSocket) => {
    setStatusBar("connected");
    outputChannel.appendLine("[bridge] Browser connected");

    const peer = createBridgePeer(
      bridgeSchema,
      {
        send: (data) => ws.send(data),
        onMessage: (handler) =>
          ws.on("message", (raw: Buffer) => handler(raw.toString())),
      },
      { scripts: [], assets: [] },
    );

    // When scripts change (from web app), update the file system
    peer.resources.scripts.subscribe((scripts) => {
      fsProvider.updateScripts(scripts);
      outputChannel.appendLine(`[bridge] Received ${scripts.length} script(s)`);
      mountWorkspaceFolder();
    });

    // When a file is edited in VS Code, push back to the web app
    fsProvider.onScriptWrite = (script) => {
      const current = peer.resources.scripts.getValue();
      const updated = current.map((s) =>
        s.path === script.path ? { ...s, content: script.content } : s,
      );
      peer.resources.scripts.setValue(updated);
    };

    // Listen for console log events
    peer.on("console:log", ({ level, message, timestamp }) => {
      outputChannel.appendLine(`[${level}] ${timestamp}: ${message}`);
    });

    ws.on("close", () => {
      fsProvider.onScriptWrite = undefined;
      setStatusBar("waiting");
      outputChannel.appendLine("[bridge] Browser disconnected");
    });
  });

  wss.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      vscode.window.showErrorMessage(
        `Vibe Games Bridge: port ${PORT} is already in use.`,
      );
    }
    setStatusBar("error");
  });
};

const mountWorkspaceFolder = (): void => {
  const uri = vscode.Uri.parse(`${FS_SCHEME}:/`);
  const already = vscode.workspace.workspaceFolders?.some(
    (f) => f.uri.scheme === FS_SCHEME,
  );
  if (!already) {
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders?.length ?? 0,
      null,
      { uri, name: "Vibe Games Scripts" },
    );
  }
};

const setStatusBar = (state: "waiting" | "connected" | "error"): void => {
  switch (state) {
    case "waiting":
      statusBarItem.text = "$(plug) Vibe Games";
      statusBarItem.tooltip = `Vibe Games Bridge: waiting for browser on port ${PORT}`;
      break;
    case "connected":
      statusBarItem.text = "$(check) Vibe Games";
      statusBarItem.tooltip = "Vibe Games Bridge: browser connected";
      break;
    case "error":
      statusBarItem.text = "$(warning) Vibe Games";
      statusBarItem.tooltip = "Vibe Games Bridge: error (click to retry)";
      break;
  }
};

export const deactivate = (): void => {
  wss?.close();
};
