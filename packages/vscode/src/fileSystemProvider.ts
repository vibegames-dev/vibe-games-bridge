import * as vscode from "vscode";

export type ScriptValue = { content: string };
export type ScriptsRecord = Record<string, ScriptValue>;

export class BridgeFileSystemProvider implements vscode.FileSystemProvider {
  private scripts = new Map<string, ScriptValue>();
  onScriptWrite: ((path: string, value: ScriptValue) => void) | undefined;
  onScriptDelete: ((path: string) => void) | undefined;

  private readonly _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  updateScripts(scripts: ScriptsRecord): void {
    const oldPaths = new Set(this.scripts.keys());
    const newPaths = new Set(Object.keys(scripts));

    const events: vscode.FileChangeEvent[] = [];

    for (const path of Object.keys(scripts)) {
      const uri = vscode.Uri.parse(`vibe-games:/${path}`);
      if (oldPaths.has(path)) {
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
    for (const [path, value] of Object.entries(scripts)) {
      this.scripts.set(path, value);
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
    options: { create: boolean; overwrite: boolean },
  ): void {
    const path = uri.path.replace(/^\//, "");
    const exists = this.scripts.has(path);

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const value = { content: Buffer.from(content).toString("utf8") };
    this.scripts.set(path, value);
    this.onScriptWrite?.(path, value);

    this._onDidChangeFile.fire([
      {
        type: exists
          ? vscode.FileChangeType.Changed
          : vscode.FileChangeType.Created,
        uri,
      },
    ]);
  }

  createDirectory(): void {
    // Directories are virtual — derived from script paths.
    // No-op is correct: the directory "exists" once a file is created under it.
    // VS Code will see it via stat()/readDirectory() after file creation.
  }

  delete(uri: vscode.Uri): void {
    const path = uri.path.replace(/^\//, "");

    // Single file delete
    if (this.scripts.has(path)) {
      this.scripts.delete(path);
      this.onScriptDelete?.(path);
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Deleted, uri },
      ]);
      return;
    }

    // Directory delete — remove all scripts under this prefix
    const prefix = `${path}/`;
    const toDelete = [...this.scripts.keys()].filter((k) =>
      k.startsWith(prefix),
    );
    if (toDelete.length === 0) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const events: vscode.FileChangeEvent[] = [];
    for (const scriptPath of toDelete) {
      this.scripts.delete(scriptPath);
      this.onScriptDelete?.(scriptPath);
      events.push({
        type: vscode.FileChangeType.Deleted,
        uri: vscode.Uri.parse(`vibe-games:/${scriptPath}`),
      });
    }
    this._onDidChangeFile.fire(events);
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    const oldPath = oldUri.path.replace(/^\//, "");
    const newPath = newUri.path.replace(/^\//, "");

    // Single file rename
    const script = this.scripts.get(oldPath);
    if (script) {
      if (this.scripts.has(newPath) && !options.overwrite) {
        throw vscode.FileSystemError.FileExists(newUri);
      }
      this.scripts.delete(oldPath);
      this.scripts.set(newPath, script);
      this.onScriptDelete?.(oldPath);
      this.onScriptWrite?.(newPath, script);
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Deleted, uri: oldUri },
        { type: vscode.FileChangeType.Created, uri: newUri },
      ]);
      return;
    }

    // Directory rename — move all scripts under this prefix
    const oldPrefix = `${oldPath}/`;
    const toMove = [...this.scripts.entries()].filter(([k]) =>
      k.startsWith(oldPrefix),
    );
    if (toMove.length === 0) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }
    const events: vscode.FileChangeEvent[] = [];
    for (const [scriptPath, value] of toMove) {
      const renamed = newPath + scriptPath.slice(oldPath.length);
      this.scripts.delete(scriptPath);
      this.scripts.set(renamed, value);
      this.onScriptDelete?.(scriptPath);
      this.onScriptWrite?.(renamed, value);
      events.push(
        {
          type: vscode.FileChangeType.Deleted,
          uri: vscode.Uri.parse(`vibe-games:/${scriptPath}`),
        },
        {
          type: vscode.FileChangeType.Created,
          uri: vscode.Uri.parse(`vibe-games:/${renamed}`),
        },
      );
    }
    this._onDidChangeFile.fire(events);
  }

  private isDirectory(path: string): boolean {
    const prefix = `${path}/`;
    for (const key of this.scripts.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }
}
