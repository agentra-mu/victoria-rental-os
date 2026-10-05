import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS } from "@/lib/agent/tools";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("only an authenticated owner action can change payment status", () => {
  it("no agent tool mentions payment status or marking paid", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.name).not.toMatch(/paid|payment/i);
      expect(JSON.stringify(tool.input_schema)).not.toMatch(
        /payment_status|paymentStatus/i,
      );
    }
  });
  it("no /api route and none of the agent code imports payments.ts or writes payment_status", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      ...walk(path.join(root, "app/api")),
      ...walk(path.join(root, "lib/agent")),
    ].filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/domain\/payments/);
      expect(src, f).not.toMatch(/payment_status\s*:/);
      expect(src, f).not.toMatch(/from\(["']payments["']\)/);
    }
  });
  it("markAsPaid/undo are only imported by dashboard server actions", () => {
    const root = path.resolve(__dirname, "../..");
    const users = [
      ...walk(path.join(root, "app")),
      ...walk(path.join(root, "lib")),
    ].filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !f.endsWith(".test.ts") &&
        readFileSync(f, "utf8").includes("domain/payments"),
    );
    for (const f of users) expect(f).toMatch(/app\/dashboard\//);
  });
});
