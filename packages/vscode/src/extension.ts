import * as vscode from "vscode";
import { type WebSocket, WebSocketServer } from "ws";
import {
  BridgeFileSystemProvider,
  type BridgeScript,
} from "./fileSystemProvider";
import { OutputChannelBridge } from "./outputChannelBridge";

const PORT = 4567;
const FS_SCHEME = "vibe-games";

let wss: WebSocketServer | undefined;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
const outputChannelBridge = new OutputChannelBridge();
const fsProvider = new BridgeFileSystemProvider();

export function activate(context: vscode.ExtensionContext): void {
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
}

function startServer(): void {
  wss = new WebSocketServer({ port: PORT });

  wss.on("listening", () => {
    setStatusBar("waiting");
    outputChannel.appendLine(`[bridge] Listening on ws://localhost:${PORT}`);
  });

  wss.on("connection", (ws: WebSocket) => {
    setStatusBar("connected");
    outputChannel.appendLine("[bridge] Browser connected");

    fsProvider.onScriptWrite = (script) => {
      ws.send(JSON.stringify({ kind: "scriptUpdate", script }));
    };

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      handleMessage(msg);
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
}

function handleMessage(msg: unknown): void {
  if (typeof msg !== "object" || msg === null) return;
  const m = msg as Record<string, unknown>;

  if (m.kind === "hello") {
    outputChannel.appendLine(
      `[bridge] Project: ${(m.projectId as string | undefined) ?? "unknown"}`,
    );
  }

  if (m.kind === "scripts") {
    const scripts = m.scripts as BridgeScript[] | undefined;
    if (!scripts) return;

    fsProvider.updateScripts(scripts);
    outputChannelBridge.appendLine(
      `[bridge] Received ${scripts.length} script(s)`,
    );
    outputChannel.appendLine(`[bridge] Received ${scripts.length} script(s)`);
    outputChannel.show();

    mountWorkspaceFolder();
  }
}

function mountWorkspaceFolder(): void {
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
}

function setStatusBar(state: "waiting" | "connected" | "error"): void {
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
}

export function deactivate(): void {
  wss?.close();
}
