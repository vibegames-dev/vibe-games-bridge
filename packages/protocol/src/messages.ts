import { z } from "zod";

import { bridgeErrorSchema } from "./errors";
import { bridgeResourceDescriptorSchema } from "./resources";

export const bridgeClientRequestSchema = z.object({
  kind: z.literal("request"),
  requestId: z.string(),
  type: z.string(),
  payload: z.unknown().optional(),
});

export const bridgeServerResponseSchema = z.object({
  kind: z.literal("response"),
  requestId: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: bridgeErrorSchema.optional(),
});

export const bridgeEventSchema = z.object({
  kind: z.literal("event"),
  type: z.string(),
  payload: z.unknown().optional(),
});

export const bridgeHelloSchema = z.object({
  kind: z.literal("hello"),
  protocolVersion: z.literal(1),
  token: z.string().optional(),
});

export const bridgeResourceSnapshotSchema = z.object({
  kind: z.literal("resource-snapshot"),
  resource: bridgeResourceDescriptorSchema,
  contents: z.string().optional(),
});

export const bridgeClientMessageSchema = z.union([
  bridgeHelloSchema,
  bridgeClientRequestSchema,
]);

export const bridgeServerMessageSchema = z.union([
  bridgeServerResponseSchema,
  bridgeEventSchema,
  bridgeResourceSnapshotSchema,
]);

export type BridgeClientRequest = z.infer<typeof bridgeClientRequestSchema>;
export type BridgeServerResponse = z.infer<typeof bridgeServerResponseSchema>;
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;
export type BridgeHello = z.infer<typeof bridgeHelloSchema>;
export type BridgeResourceSnapshot = z.infer<
  typeof bridgeResourceSnapshotSchema
>;
export type BridgeClientMessage = z.infer<typeof bridgeClientMessageSchema>;
export type BridgeServerMessage = z.infer<typeof bridgeServerMessageSchema>;
