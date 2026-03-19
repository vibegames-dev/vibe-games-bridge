import { describe, expect, it } from "vitest";
import {
  assetEntrySchema,
  diagnosticSchema,
  scriptEntrySchema,
} from "./schema";

describe("scriptEntrySchema", () => {
  it("accepts valid script entries", () => {
    const result = scriptEntrySchema.safeParse({
      path: "src/main.ts",
      content: 'console.log("hello")',
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing path", () => {
    const result = scriptEntrySchema.safeParse({ content: "code" });
    expect(result.success).toBe(false);
  });

  it("rejects missing content", () => {
    const result = scriptEntrySchema.safeParse({ path: "a.ts" });
    expect(result.success).toBe(false);
  });

  it("rejects wrong types", () => {
    const result = scriptEntrySchema.safeParse({ path: 123, content: true });
    expect(result.success).toBe(false);
  });
});

describe("assetEntrySchema", () => {
  it("accepts valid asset entries", () => {
    const result = assetEntrySchema.safeParse({
      path: "images/logo.png",
      size: 1024,
      type: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = assetEntrySchema.safeParse({ path: "a.png" });
    expect(result.success).toBe(false);
  });

  it("rejects non-number size", () => {
    const result = assetEntrySchema.safeParse({
      path: "a.png",
      size: "big",
      type: "image/png",
    });
    expect(result.success).toBe(false);
  });
});

describe("diagnosticSchema", () => {
  it("accepts valid diagnostics", () => {
    const result = diagnosticSchema.safeParse({
      path: "src/main.ts",
      severity: "error",
      message: "Unexpected token",
      line: 10,
      column: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all severity levels", () => {
    for (const severity of ["error", "warning", "info", "hint"]) {
      const result = diagnosticSchema.safeParse({
        path: "a.ts",
        severity,
        message: "msg",
        line: 1,
        column: 1,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid severity", () => {
    const result = diagnosticSchema.safeParse({
      path: "a.ts",
      severity: "critical",
      message: "msg",
      line: 1,
      column: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-number line/column", () => {
    const result = diagnosticSchema.safeParse({
      path: "a.ts",
      severity: "error",
      message: "msg",
      line: "ten",
      column: "five",
    });
    expect(result.success).toBe(false);
  });
});
