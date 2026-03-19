import { describe, expect, it } from "vitest";
import { diagnosticSchema, scriptValueSchema } from "./schema";

describe("scriptValueSchema", () => {
  it("accepts valid script values", () => {
    const result = scriptValueSchema.safeParse({
      content: 'console.log("hello")',
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing content", () => {
    const result = scriptValueSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects wrong types", () => {
    const result = scriptValueSchema.safeParse({ content: 123 });
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
