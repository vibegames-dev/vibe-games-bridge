export class OutputChannelBridge {
  private readonly lines: string[] = [];

  appendLine(line: string): void {
    this.lines.push(line);
  }

  read(): string[] {
    return [...this.lines];
  }
}
