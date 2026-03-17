export interface BridgeDiagnostic {
  path: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export class BridgeDiagnosticsProvider {
  private diagnostics: BridgeDiagnostic[] = [];

  replaceAll(diagnostics: BridgeDiagnostic[]): void {
    this.diagnostics = diagnostics;
  }

  list(): BridgeDiagnostic[] {
    return this.diagnostics;
  }
}
