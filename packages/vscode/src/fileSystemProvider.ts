import * as vscode from "vscode";

export interface BridgeScript {
  id: string;
  name: string;
  code: string;
}

export class BridgeFileSystemProvider implements vscode.FileSystemProvider {
  private scripts = new Map<string, BridgeScript>();
  onScriptWrite: ((script: BridgeScript) => void) | undefined;

  private readonly _onDidChangeFile =
    new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  updateScripts(scripts: BridgeScript[]): void {
    this.scripts.clear();
    for (const script of scripts) {
      this.scripts.set(script.name, script);
    }
    this._onDidChangeFile.fire([
      {
        type: vscode.FileChangeType.Changed,
        uri: vscode.Uri.parse("vibe-games:/scripts"),
      },
    ]);
  }

  watch(): vscode.Disposable {
    return { dispose: () => {} };
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const now = Date.now();

    if (uri.path === "/" || uri.path === "/scripts") {
      return { type: vscode.FileType.Directory, ctime: now, mtime: now, size: 0 };
    }

    const script = this.scriptForUri(uri);
    if (script) {
      return {
        type: vscode.FileType.File,
        ctime: now,
        mtime: now,
        size: script.code.length,
      };
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    if (uri.path === "/") {
      return [["scripts", vscode.FileType.Directory]];
    }
    if (uri.path === "/scripts") {
      return [...this.scripts.keys()].map((name) => [
        `${name}.ts`,
        vscode.FileType.File,
      ]);
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const script = this.scriptForUri(uri);
    if (!script) throw vscode.FileSystemError.FileNotFound(uri);
    return Buffer.from(script.code, "utf8");
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): void {
    const script = this.scriptForUri(uri);
    if (!script) throw vscode.FileSystemError.FileNotFound(uri);

    const updatedScript = { ...script, code: Buffer.from(content).toString("utf8") };
    this.scripts.set(script.name, updatedScript);
    this.onScriptWrite?.(updatedScript);

    this._onDidChangeFile.fire([
      { type: vscode.FileChangeType.Changed, uri },
    ]);
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

  private scriptForUri(uri: vscode.Uri): BridgeScript | undefined {
    const filename = uri.path.split("/").pop() ?? "";
    const name = filename.endsWith(".ts") ? filename.slice(0, -3) : filename;
    return this.scripts.get(name);
  }
}
