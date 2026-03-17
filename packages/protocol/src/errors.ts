import { z } from "zod";

export const bridgeErrorCodeSchema = z.enum([
  "unauthorized",
  "forbidden",
  "not-found",
  "conflict",
  "invalid-request",
  "unsupported",
  "internal",
]);

export type BridgeErrorCode = z.infer<typeof bridgeErrorCodeSchema>;

export const bridgeErrorSchema = z.object({
  code: bridgeErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type BridgeError = z.infer<typeof bridgeErrorSchema>;
