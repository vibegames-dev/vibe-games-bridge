import { z } from "zod";
import { defineBridgeSchema } from "@vibe-games-bridge/core";

// --- Resource item schemas ---

export const scriptEntrySchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const assetEntrySchema = z.object({
  path: z.string(),
  size: z.number(),
  type: z.string(),
});

// --- Diagnostic schema ---

export const diagnosticSchema = z.object({
  path: z.string(),
  severity: z.enum(["error", "warning", "info", "hint"]),
  message: z.string(),
  line: z.number(),
  column: z.number(),
});

// --- Bridge schema ---

export const bridgeSchema = defineBridgeSchema({
  resources: {
    scripts: z.array(scriptEntrySchema),
    assets: z.array(assetEntrySchema),
  },
  events: {
    "console:log": z.object({
      level: z.enum(["debug", "info", "warn", "error"]),
      message: z.string(),
      timestamp: z.string(),
    }),
    "diagnostics:update": z.object({
      path: z.string(),
      diagnostics: z.array(diagnosticSchema),
    }),
  },
  requests: {
    "script:run": {
      params: z.object({ path: z.string() }),
      result: z.object({
        success: z.boolean(),
        output: z.string().optional(),
      }),
    },
    "dialog:open": {
      params: z.object({ title: z.string(), body: z.string() }),
      result: z.object({ confirmed: z.boolean() }),
    },
  },
});
