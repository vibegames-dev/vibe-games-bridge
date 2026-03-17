export interface OpenBridgeUriParams {
  projectId?: string;
  workspace?: string;
  serverUrl?: string;
  token?: string;
}

export function parseOpenBridgeUri(uri: string): OpenBridgeUriParams {
  const url = new URL(uri);

  return {
    projectId: url.searchParams.get("projectId") ?? undefined,
    workspace: url.searchParams.get("workspace") ?? undefined,
    serverUrl: url.searchParams.get("serverUrl") ?? undefined,
    token: url.searchParams.get("token") ?? undefined,
  };
}
