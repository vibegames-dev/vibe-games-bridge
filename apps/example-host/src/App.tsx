import type { BridgePeer } from "@vibe-games-bridge/core";
import { createBridgePeer } from "@vibe-games-bridge/core";
import { bridgeSchema } from "@vibe-games-bridge/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = "ws://localhost:4567";
const VSCODE_URI = "vscode://vibe-games-bridge.vscode/open?projectId=example-game";

type Script = { path: string; content: string };
type Peer = BridgePeer<
  (typeof bridgeSchema)["resources"],
  (typeof bridgeSchema)["events"],
  (typeof bridgeSchema)["requests"]
>;

const initialScripts: Script[] = [
  {
    path: "scripts/playerController.ts",
    content:
      "export function movePlayer(\n  direction: { x: number; y: number; z: number },\n  speed: number\n) {\n  // TODO: implement player movement\n}",
  },
  {
    path: "scripts/enemyAi.ts",
    content:
      "export function updateEnemy(dt: number) {\n  // TODO: implement enemy AI\n}",
  },
];

export const App = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [connected, setConnected] = useState(false);
  const [lastResponse, setLastResponse] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const log = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return;

    log("Connecting to bridge...");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("message", (e) => {
      log(`\u2190 ${e.data}`);
    });

    ws.addEventListener("open", () => {
      log("Connected");
      setConnected(true);

      const peer = createBridgePeer(
        bridgeSchema,
        {
          send: (data) => {
            log(`\u2192 ${data}`);
            ws.send(data);
          },
          onMessage: (handler) =>
            ws.addEventListener("message", (e) => handler(e.data)),
        },
        { scripts: initialScripts, assets: [] },
      );

      peer.onRequest("script:run", async ({ path }) => {
        log(`Running script: ${path}`);
        return { success: true, output: `Executed ${path}` };
      });

      peer.onRequest("dialog:open", async ({ title, body }) => {
        log(`Dialog: ${title} - ${body}`);
        return { confirmed: true };
      });

      peer.resources.scripts.setValue(initialScripts);
      peerRef.current = peer;
      log("Bridge peer ready");
    });

    ws.addEventListener("close", () => {
      log("Disconnected");
      setConnected(false);
      peerRef.current = null;
      wsRef.current = null;
    });

    ws.addEventListener("error", () => log("Connection error"));
  }, [log]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  });

  const openVSCode = () => {
    window.open(VSCODE_URI, "_blank");
  };

  const emitConsoleLog = () => {
    peerRef.current?.emit("console:log", {
      level: "info",
      message: "Hello from example host!",
      timestamp: new Date().toISOString(),
    });
  };

  const sendDialogRequest = () => {
    peerRef.current
      ?.request("dialog:open", {
        title: "Test Dialog",
        body: "This is a test dialog from the example host.",
      })
      .then((res) => setLastResponse(JSON.stringify(res)))
      .catch((err: unknown) => setLastResponse(`Error: ${err}`));
  };

  const updateScript = (index: number, field: keyof Script, value: string) => {
    setScripts((prev) => {
      const next = prev.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      );
      peerRef.current?.resources.scripts.setValue(next);
      return next;
    });
  };

  const addScript = () => {
    setScripts((prev) => {
      const next = [...prev, { path: "scripts/new.ts", content: "" }];
      peerRef.current?.resources.scripts.setValue(next);
      return next;
    });
  };

  const removeScript = (index: number) => {
    setScripts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      peerRef.current?.resources.scripts.setValue(next);
      return next;
    });
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 700,
        margin: "40px auto",
        padding: "0 20px",
      }}
    >
      <h1>Vibe Games Bridge</h1>

      <Section title="Connection">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={openVSCode}>
            Open VS Code
          </button>
          {connected ? (
            <button type="button" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button type="button" onClick={connect}>
              Connect
            </button>
          )}
          <span style={{ fontSize: 13, color: connected ? "#0a0" : "#888" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </Section>

      <Section title="Actions">
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={!connected} onClick={emitConsoleLog}>
            Emit console:log
          </button>
          <button
            type="button"
            disabled={!connected}
            onClick={sendDialogRequest}
          >
            Request dialog:open
          </button>
        </div>
        {lastResponse && (
          <pre style={{ margin: "8px 0 0", fontSize: 13 }}>
            Response: {lastResponse}
          </pre>
        )}
      </Section>

      <Section title="Scripts (resource)">
        {scripts.map((script, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              padding: 12,
              border: "1px solid #333",
              borderRadius: 6,
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={script.path}
                onChange={(e) => updateScript(i, "path", e.target.value)}
                placeholder="path"
                style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
              />
              <button type="button" onClick={() => removeScript(i)}>
                Remove
              </button>
            </div>
            <textarea
              value={script.content}
              onChange={(e) => updateScript(i, "content", e.target.value)}
              rows={5}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        <button type="button" onClick={addScript}>
          + Add Script
        </button>
      </Section>

      <Section title="Traffic Log">
        <div
          ref={logRef}
          style={{
            background: "#1a1a1a",
            color: "#0f0",
            padding: 16,
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 13,
            maxHeight: 300,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </Section>
    </div>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
};
