import * as vscode from "vscode";

export type ScriptValue = { content: string };
export type ScriptsRecord = Record<string, ScriptValue>;

const JS_EXT = ".js";
export const toFsPath = (key: string): string =>
  key.endsWith(JS_EXT) ? key : `${key}${JS_EXT}`;

export class BridgeFileSystemProvider implements vscode.FileSystemProvider {
  private scripts = new Map<string, ScriptValue>();

  // Resolve a FS path to its bridge key. Tries exact match first (for keys
  // that already end in .js), then falls back to stripping the added .js.
  private resolveKey(fsPath: string): string | undefined {
    if (this.scripts.has(fsPath)) return fsPath;
    if (fsPath.endsWith(JS_EXT)) {
      const stripped = fsPath.slice(0, -JS_EXT.length);
      if (this.scripts.has(stripped)) return stripped;
    }
    return undefined;
  }
  onScriptWrite: ((path: string, value: ScriptValue) => void) | undefined;
  onScriptDelete: ((path: string) => void) | undefined;

  private readonly _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  updateScripts(scripts: ScriptsRecord): void {
    const oldKeys = new Set(this.scripts.keys());
    const newKeys = new Set(Object.keys(scripts));

    const events: vscode.FileChangeEvent[] = [];

    for (const key of newKeys) {
      const uri = vscode.Uri.parse(`vibe-games:/${toFsPath(key)}`);
      if (oldKeys.has(key)) {
        if (this.scripts.get(key)?.content !== scripts[key]?.content) {
          events.push({ type: vscode.FileChangeType.Changed, uri });
        }
      } else {
        events.push({ type: vscode.FileChangeType.Created, uri });
      }
    }

    for (const oldKey of oldKeys) {
      if (!newKeys.has(oldKey)) {
        events.push({
          type: vscode.FileChangeType.Deleted,
          uri: vscode.Uri.parse(`vibe-games:/${toFsPath(oldKey)}`),
        });
      }
    }

    this.scripts.clear();
    for (const [key, value] of Object.entries(scripts)) {
      this.scripts.set(key, value);
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
    const fsPath = uri.path.replace(/^\//, "");

    if (fsPath === "" || this.isDirectory(fsPath)) {
      return {
        type: vscode.FileType.Directory,
        ctime: now,
        mtime: now,
        size: 0,
      };
    }

    const key = this.resolveKey(fsPath);
    const script = key != null ? this.scripts.get(key) : undefined;
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

    for (const key of this.scripts.keys()) {
      const fsPath = toFsPath(key);
      if (dir === "" || fsPath.startsWith(`${dir}/`)) {
        const relative = dir === "" ? fsPath : fsPath.slice(dir.length + 1);
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
    const key = this.resolveKey(uri.path.replace(/^\//, ""));
    const script = key != null ? this.scripts.get(key) : undefined;
    if (!script) throw vscode.FileSystemError.FileNotFound(uri);
    return Buffer.from(script.content, "utf8");
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    const fsPath = uri.path.replace(/^\//, "");
    const existingKey = this.resolveKey(fsPath);

    if (!existingKey && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (existingKey && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    // Use existing key if overwriting, otherwise derive from FS path
    const key = existingKey ?? fsPath;
    const value = { content: Buffer.from(content).toString("utf8") };
    this.scripts.set(key, value);
    this.onScriptWrite?.(key, value);

    this._onDidChangeFile.fire([
      {
        type: existingKey
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
    const fsPath = uri.path.replace(/^\//, "");
    const key = this.resolveKey(fsPath);

    // Single file delete
    if (key != null) {
      this.scripts.delete(key);
      this.onScriptDelete?.(key);
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Deleted, uri },
      ]);
      return;
    }

    // Directory delete — remove all scripts under this prefix
    const prefix = `${fsPath}/`;
    const toDelete = [...this.scripts.keys()].filter((k) =>
      toFsPath(k).startsWith(prefix),
    );
    if (toDelete.length === 0) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const events: vscode.FileChangeEvent[] = [];
    for (const scriptKey of toDelete) {
      this.scripts.delete(scriptKey);
      this.onScriptDelete?.(scriptKey);
      events.push({
        type: vscode.FileChangeType.Deleted,
        uri: vscode.Uri.parse(`vibe-games:/${toFsPath(scriptKey)}`),
      });
    }
    this._onDidChangeFile.fire(events);
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    const oldKey = this.resolveKey(oldUri.path.replace(/^\//, ""));
    const newFsPath = newUri.path.replace(/^\//, "");

    // Single file rename
    const script = oldKey != null ? this.scripts.get(oldKey) : undefined;
    if (oldKey != null && script) {
      const newKey = this.resolveKey(newFsPath) ?? newFsPath;
      if (this.scripts.has(newKey) && !options.overwrite) {
        throw vscode.FileSystemError.FileExists(newUri);
      }
      this.scripts.delete(oldKey);
      this.scripts.set(newKey, script);
      this.onScriptDelete?.(oldKey);
      this.onScriptWrite?.(newKey, script);
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Deleted, uri: oldUri },
        { type: vscode.FileChangeType.Created, uri: newUri },
      ]);
      return;
    }

    // Directory rename — move all scripts under this prefix
    const oldFsPrefix = `${oldUri.path.replace(/^\//, "")}/`;
    const toMove = [...this.scripts.entries()].filter(([k]) =>
      toFsPath(k).startsWith(oldFsPrefix),
    );
    if (toMove.length === 0) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }
    const events: vscode.FileChangeEvent[] = [];
    const newFsDir = newUri.path.replace(/^\//, "");
    for (const [scriptKey, value] of toMove) {
      const oldFsPath = toFsPath(scriptKey);
      const newFsPath = `${newFsDir}/${oldFsPath.slice(oldFsPrefix.length)}`;
      const renamedKey = this.resolveKey(newFsPath) ?? newFsPath;
      this.scripts.delete(scriptKey);
      this.scripts.set(renamedKey, value);
      this.onScriptDelete?.(scriptKey);
      this.onScriptWrite?.(renamedKey, value);
      events.push(
        {
          type: vscode.FileChangeType.Deleted,
          uri: vscode.Uri.parse(`vibe-games:/${oldFsPath}`),
        },
        {
          type: vscode.FileChangeType.Created,
          uri: vscode.Uri.parse(`vibe-games:/${newFsPath}`),
        },
      );
    }
    this._onDidChangeFile.fire(events);
  }

  private isDirectory(fsPath: string): boolean {
    const prefix = `${fsPath}/`;
    for (const key of this.scripts.keys()) {
      if (toFsPath(key).startsWith(prefix)) return true;
    }
    return false;
  }
}
