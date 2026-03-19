import * as vscode from "vscode";

export type ScriptEntry = { path: string; content: string };

export class BridgeFileSystemProvider implements vscode.FileSystemProvider {
  private scripts = new Map<string, ScriptEntry>();
  onScriptWrite: ((script: ScriptEntry) => void) | undefined;

  private readonly _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  updateScripts(scripts: ScriptEntry[]): void {
    const oldPaths = new Set(this.scripts.keys());
    const newPaths = new Set(scripts.map((s) => s.path));

    const events: vscode.FileChangeEvent[] = [];

    for (const script of scripts) {
      const uri = vscode.Uri.parse(`vibe-games:/${script.path}`);
      if (oldPaths.has(script.path)) {
        events.push({ type: vscode.FileChangeType.Changed, uri });
      } else {
        events.push({ type: vscode.FileChangeType.Created, uri });
      }
    }

    for (const oldPath of oldPaths) {
      if (!newPaths.has(oldPath)) {
        events.push({
          type: vscode.FileChangeType.Deleted,
          uri: vscode.Uri.parse(`vibe-games:/${oldPath}`),
        });
      }
    }

    this.scripts.clear();
    for (const script of scripts) {
      this.scripts.set(script.path, script);
    }

    if (events.length > 0) {
      this._onDidChangeFile.fire(events);
    }
  }

  watch(): vscode.Disposable {
    return { dispose: () => {} };
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const now = Date.now();
    const path = uri.path.replace(/^\//, "");

    if (path === "" || this.isDirectory(path)) {
      return {
        type: vscode.FileType.Directory,
        ctime: now,
        mtime: now,
        size: 0,
      };
    }

    const script = this.scripts.get(path);
    if (script) {
      return {
        type: vscode.FileType.File,
        ctime: now,
        mtime: now,
        size: script.content.length,
      };
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const dir = uri.path.replace(/^\//, "");
    const entries: [string, vscode.FileType][] = [];
    const seen = new Set<string>();

    for (const scriptPath of this.scripts.keys()) {
      if (dir === "" || scriptPath.startsWith(`${dir}/`)) {
        const relative =
          dir === "" ? scriptPath : scriptPath.slice(dir.length + 1);
        const parts = relative.split("/");
        const name = parts[0]!;

        if (seen.has(name)) continue;
        seen.add(name);

        if (parts.length === 1) {
          entries.push([name, vscode.FileType.File]);
        } else {
          entries.push([name, vscode.FileType.Directory]);
        }
      }
    }

    return entries;
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const path = uri.path.replace(/^\//, "");
    const script = this.scripts.get(path);
    if (!script) throw vscode.FileSystemError.FileNotFound(uri);
    return Buffer.from(script.content, "utf8");
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): void {
    const path = uri.path.replace(/^\//, "");
    const script = this.scripts.get(path);
    if (!script) throw vscode.FileSystemError.FileNotFound(uri);

    const updated = {
      ...script,
      content: Buffer.from(content).toString("utf8"),
    };
    this.scripts.set(path, updated);
    this.onScriptWrite?.(updated);

    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only for now");
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only for now");
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only for now");
  }

  private isDirectory(path: string): boolean {
    const prefix = `${path}/`;
    for (const key of this.scripts.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }
}
