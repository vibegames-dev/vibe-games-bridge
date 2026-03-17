export interface VirtualFileEntry {
  path: string;
  readOnly?: boolean;
}

export class BridgeFileSystemProvider {
  private readonly entries = new Map<string, VirtualFileEntry>();

  register(entry: VirtualFileEntry): void {
    this.entries.set(entry.path, entry);
  }

  list(): VirtualFileEntry[] {
    return [...this.entries.values()];
  }
}
