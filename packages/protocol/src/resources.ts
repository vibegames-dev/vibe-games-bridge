import { z } from "zod";

export const bridgeResourceKindSchema = z.enum([
  "script",
  "material",
  "scene",
  "config",
  "log",
  "diagnostic",
  "ai-thread",
]);

export type BridgeResourceKind = z.infer<typeof bridgeResourceKindSchema>;

export const bridgeResourceDescriptorSchema = z.object({
  kind: bridgeResourceKindSchema,
  path: z.string(),
  version: z.string().optional(),
  readOnly: z.boolean().default(false),
});

export type BridgeResourceDescriptor = z.infer<
  typeof bridgeResourceDescriptorSchema
>;
