import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const root = path.resolve(__dirname, "../..");
const sourceFiles = (...dirs: string[]) =>
  dirs
    .flatMap((d) => walk(path.join(root, d)))
    .filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !/\.test\.tsx?$/.test(f) &&
        !f.includes("/testing/"),
    );

const botFiles = () => sourceFiles("lib/bot", "lib/llm");

/** The only /lib/domain modules the conversation code may import. All state changes go through these. */
const ALLOWED_DOMAIN_IMPORTS = new Set([
  "calculatePrice",
  "cancelBooking",
  "config",
  "confirmBooking",
  "createBookingDraft",
  "customerContext",
  "errors",
  "escalateBookingToHuman",
  "getAvailableVehicles",
  "getFleet",
  "ports",
  "updateBookingDraft",
]);

describe("only an authenticated owner action can change payment status", () => {
  it("no /api route and none of the bot / LLM code imports payments.ts or writes payment_status", () => {
    for (const f of [...sourceFiles("app/api"), ...botFiles()]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/domain\/payments/);
      expect(src, f).not.toMatch(/payment_status\s*:/);
      expect(src, f).not.toMatch(/paymentStatus\s*[:=]\s*["'`](PAID|REFUNDED)/);
      expect(src, f).not.toMatch(/from\(["']payments["']\)/);
      expect(src, f).not.toMatch(/markAsPaid|undoPayment/);
    }
  });

  it("the bot and LLM code never mention the payment_status column at all", () => {
    for (const f of botFiles())
      expect(readFileSync(f, "utf8"), f).not.toMatch(/payment_status/);
  });

  it("markAsPaid/undo are only imported by dashboard server actions", () => {
    const users = sourceFiles("app", "lib").filter((f) =>
      readFileSync(f, "utf8").includes("domain/payments"),
    );
    for (const f of users) expect(f).toMatch(/app\/dashboard\//);
  });
});

describe("the bot and the LLM layer can only change bookings through /lib/domain", () => {
  it("never write to the database directly", () => {
    for (const f of botFiles()) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\.updateBooking\(/);
      expect(src, f).not.toMatch(/\.createBooking\(/);
      expect(src, f).not.toMatch(/\.createDocument\(/);
      expect(src, f).not.toMatch(/\.recordEvent\(/);
      expect(src, f).not.toMatch(
        /\.from\(["'](bookings|payments|documents|booking_events)["']\)/,
      );
      expect(src, f).not.toMatch(/@\/lib\/supabase/);
    }
  });

  it("import only the whitelisted /lib/domain modules", () => {
    for (const f of botFiles()) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(
        /from\s+["']@\/lib\/domain\/([A-Za-z]+)["']/g,
      )) {
        expect(
          ALLOWED_DOMAIN_IMPORTS.has(m[1]),
          `${f} imports lib/domain/${m[1]}`,
        ).toBe(true);
      }
    }
  });

  it("only lib/bot/deps.ts reaches into lib/db (production wiring)", () => {
    for (const f of botFiles()) {
      const src = readFileSync(f, "utf8");
      if (/\/lib\/bot\/deps\.ts$/.test(f)) continue;
      if (/\/lib\/llm\/ownerTools\.ts$/.test(f)) continue;
      expect(src, f).not.toMatch(/@\/lib\/db\//);
    }
  });

  it("the LLM tasks have no tools and no payment or booking fields in their schemas", () => {
    const tasks = readFileSync(path.join(root, "lib/llm/tasks.ts"), "utf8");
    expect(tasks).not.toMatch(/tool_?use|tools\s*:/i);
    expect(tasks).not.toMatch(/paymentStatus|payment_status|bookingId/);
    const provider = readFileSync(
      path.join(root, "lib/llm/provider.ts"),
      "utf8",
    );
    expect(provider).not.toMatch(/tools\s*:|tool_choice|function_call/);
  });
});
