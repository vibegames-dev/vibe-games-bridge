export interface BridgeWorkspaceState {
  projectId?: string;
  workspaceName?: string;
  serverUrl?: string;
}

export function createInitialWorkspaceState(): BridgeWorkspaceState {
  return {};
}
