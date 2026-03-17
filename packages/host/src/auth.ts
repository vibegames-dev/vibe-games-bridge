import type { BridgeAuthContext, BridgeHostOptions } from "./types";

export async function authenticateBridgeToken(
  token: string | undefined,
  options: Pick<BridgeHostOptions, "authenticateToken">,
): Promise<BridgeAuthContext> {
  return options.authenticateToken(token);
}
