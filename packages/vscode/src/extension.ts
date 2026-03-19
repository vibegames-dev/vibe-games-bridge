import { createBridgePeer } from "@vibe-games-bridge/core";
import { bridgeSchema } from "@vibe-games-bridge/protocol";
import * as vscode from "vscode";
import { type WebSocket, WebSocketServer } from "ws";
import { BridgeFileSystemProvider, toFsPath } from "./fileSystemProvider";

const FS_SCHEME = "vibe-games";

const getPort = (): number =>
  vscode.workspace.getConfiguration("vibeGamesBridge").get("port", 4567);

let wss: WebSocketServer | undefined;
let activePort: number | undefined;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;
let currentProjectId: string | undefined;
const fsProvider = new BridgeFileSystemProvider();

export const activate = (context: vscode.ExtensionContext): void => {
  outputChannel = vscode.window.createOutputChannel("Vibe Games Bridge");
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("vibe-games");

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

  const uriHandler: vscode.UriHandler = {
    handleUri: (uri: vscode.Uri) => {
      const projectId =
        new URLSearchParams(uri.query).get("projectId") ?? undefined;
      currentProjectId = projectId;
      outputChannel.appendLine(
        `[bridge] URI opened${projectId ? ` (projectId: ${projectId})` : ""}`,
      );
    },
  };

  context.subscriptions.push(
    statusBarItem,
    fsRegistration,
    diagnosticCollection,
    reconnectCmd,
    vscode.window.registerUriHandler(uriHandler),
    {
      dispose: () => {
        outputChannel.dispose();
        wss?.close();
      },
    },
  );
};

const startServer = (): void => {
  const port = getPort();
  activePort = port;
  wss = new WebSocketServer({ port });

  wss.on("listening", () => {
    setStatusBar("waiting");
    outputChannel.appendLine(`[bridge] Listening on ws://localhost:${port}`);
  });

  wss.on("connection", (ws: WebSocket) => {
    setStatusBar("connected");
    outputChannel.appendLine("[bridge] Browser connected");

    const peer = createBridgePeer(
      bridgeSchema,
      {
        send: (data) => ws.send(data),
        onMessage: (handler) => {
          ws.on("message", (raw: Buffer) => {
            outputChannel.appendLine(
              `[bridge] Raw message: ${raw.toString().slice(0, 200)}`,
            );
            handler(raw.toString());
          });
        },
      },
      { scripts: {} },
    );

    // When scripts change (full snapshot from web app), update the file system
    peer.resources.scripts.subscribe((scripts) => {
      const count = Object.keys(scripts).length;
      outputChannel.appendLine(
        `[bridge] Scripts subscribe fired: ${count} script(s)`,
      );
      fsProvider.updateScripts(scripts);
      mountWorkspaceFolder();
    });

    // When a file is created/edited in VS Code, push just that key back
    fsProvider.onScriptWrite = (path, value) => {
      peer.resources.scripts.setKey(path, value);
    };

    // When a file is deleted in VS Code, remove the key and clear diagnostics
    fsProvider.onScriptDelete = (path) => {
      peer.resources.scripts.deleteKey(path);
      diagnosticCollection.delete(
        vscode.Uri.parse(`${FS_SCHEME}:/${toFsPath(path)}`),
      );
    };

    // Listen for console log events
    peer.on("console:log", ({ level, message, timestamp }) => {
      outputChannel.appendLine(`[${level}] ${timestamp}: ${message}`);
    });

    // Map diagnostics from the game runtime to VS Code's Problems panel
    const severityMap = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      info: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint,
    } as const;

    peer.on("diagnostics:update", ({ path, diagnostics }) => {
      const uri = vscode.Uri.parse(`${FS_SCHEME}:/${toFsPath(path)}`);
      const mapped = diagnostics.map((d) => {
        const range = new vscode.Range(d.line, d.column, d.line, d.column);
        return new vscode.Diagnostic(range, d.message, severityMap[d.severity]);
      });
      diagnosticCollection.set(uri, mapped);
    });

    ws.on("close", () => {
      fsProvider.onScriptWrite = undefined;
      fsProvider.onScriptDelete = undefined;
      diagnosticCollection.clear();
      setStatusBar("waiting");
      outputChannel.appendLine("[bridge] Browser disconnected");
    });
  });

  wss.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      vscode.window.showErrorMessage(
        `Vibe Games Bridge: port ${port} is already in use.`,
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
    const folderName = currentProjectId
      ? `Vibe Games: (${currentProjectId})`
      : "Vibe Games 2";
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders?.length ?? 0,
      null,
      { uri, name: folderName },
    );
  }
};

const setStatusBar = (state: "waiting" | "connected" | "error"): void => {
  switch (state) {
    case "waiting":
      statusBarItem.text = "$(plug) Vibe Games";
      statusBarItem.tooltip = `Vibe Games Bridge: waiting for browser on port ${activePort ?? getPort()}`;
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
