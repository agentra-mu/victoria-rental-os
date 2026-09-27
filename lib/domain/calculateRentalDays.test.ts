import { describe, expect, it } from "vitest";
import { calculateRentalDays } from "./calculateRentalDays";
import { DomainError } from "./errors";

describe("calculateRentalDays", () => {
  it("counts an exact 24h rental as 1 day", () => {
    expect(
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z"),
    ).toBe(1);
  });

  it("back-to-back same-instant boundary (48h) counts as exactly 2 days", () => {
    expect(
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-03T10:00:00Z"),
    ).toBe(2);
  });

  it("stays 1 day when the return is within the grace period past a block boundary", () => {
    // 24h30m — 30min late, default grace is 60min.
    expect(
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-02T10:30:00Z"),
    ).toBe(1);
  });

  it("rounds up to an extra day once past the grace period", () => {
    // 25h15m — 75min late, past the default 60min grace.
    expect(
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-02T11:15:00Z"),
    ).toBe(2);
  });

  it("respects a configurable grace period", () => {
    const rule = { blockHours: 24, graceMinutes: 120 };
    // 25h15m late is within a 120min grace, so still 1 day under this rule.
    expect(
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-02T11:15:00Z", rule),
    ).toBe(1);
  });

  it("respects a configurable block length", () => {
    const rule = { blockHours: 12, graceMinutes: 0 };
    expect(
      calculateRentalDays("2026-01-01T00:00:00Z", "2026-01-01T13:00:00Z", rule),
    ).toBe(2);
  });

  it("handles a rental that crosses midnight Indian/Mauritius (UTC+4) correctly", () => {
    // 22:30 Mauritius on Jan 1 -> 01:30 Mauritius on Jan 2 is 3h, expressed in UTC offsets.
    expect(
      calculateRentalDays(
        "2026-01-01T18:30:00+00:00",
        "2026-01-01T21:30:00+00:00",
      ),
    ).toBe(1);
    // Same instants, written with explicit Mauritius offsets, must give the same result.
    expect(
      calculateRentalDays(
        "2026-01-01T22:30:00+04:00",
        "2026-01-02T01:30:00+04:00",
      ),
    ).toBe(1);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const pickup = new Date("2026-01-01T10:00:00Z");
    const ret = new Date("2026-01-02T10:00:00Z");
    expect(calculateRentalDays(pickup, ret)).toBe(1);
  });

  it("throws INVALID_DATES when return is not after pickup", () => {
    expect(() =>
      calculateRentalDays("2026-01-02T10:00:00Z", "2026-01-01T10:00:00Z"),
    ).toThrow(DomainError);
    expect(() =>
      calculateRentalDays("2026-01-01T10:00:00Z", "2026-01-01T10:00:00Z"),
    ).toThrow(DomainError);
  });
});
