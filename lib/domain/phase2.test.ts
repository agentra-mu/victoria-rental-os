import { describe, expect, it } from "vitest";
import {
  can,
  assertCan,
  PermissionError,
  PERMISSIONS,
  type StaffIdentity,
} from "./permissions";
import { checkAfterHours, isWithinOpeningHours } from "./openingHours";
import {
  defaultStrategy,
  hasExpiredPapers,
  pickVehicle,
  type AssignableVehicle,
} from "./assignVehicle";
import { additionalDays, lateFeeRs, quoteAdditionalRs } from "./changeRequests";
import { isWithin24hWindow, needsTakeoverReminder } from "./takeover";
import { vehicleAlerts } from "./fleetAlerts";
import { conversationPriority } from "./inboxPriority";
import { calculatePrice } from "./calculatePrice";
import { createFakeDb } from "./testing/fakeDb";
import { location, vehicle } from "./testing/fixtures";

const owner: StaffIdentity = {
  id: "o",
  name: "O",
  role: "OWNER",
  active: true,
};
const staff: StaffIdentity = {
  id: "s",
  name: "S",
  role: "STAFF",
  active: true,
};

describe("permissions", () => {
  it("owner can do everything", () => {
    for (const p of PERMISSIONS) expect(can(owner, p)).toBe(true);
  });
  it("staff is denied every owner-only action", () => {
    for (const p of [
      "undo_payment",
      "reject_documents",
      "staff_management",
      "analytics",
      "settings",
      "audit_log",
      "data_export",
    ] as const) {
      expect(can(staff, p)).toBe(false);
      expect(() => assertCan(staff, p)).toThrow(PermissionError);
    }
  });
  it("staff can do day-to-day work, and overrides can revoke but never grant owner-only", () => {
    expect(can(staff, "mark_paid")).toBe(true);
    expect(
      can({ ...staff, permissions: { mark_paid: false } }, "mark_paid"),
    ).toBe(false);
    expect(
      can(
        { ...staff, permissions: { reject_documents: true } },
        "reject_documents",
      ),
    ).toBe(false);
  });
  it("deactivated users can do nothing", () => {
    expect(can({ ...owner, active: false }, "bookings")).toBe(false);
  });
});

describe("opening hours", () => {
  const hours = { mon: ["08:00", "18:00"] as [string, string], tue: null };
  it("2026-10-05 is a Monday in Mauritius", () => {
    expect(
      isWithinOpeningHours(hours, new Date("2026-10-05T10:00:00+04:00")),
    ).toBe(true);
    expect(
      isWithinOpeningHours(hours, new Date("2026-10-05T19:00:00+04:00")),
    ).toBe(false);
    expect(
      isWithinOpeningHours(hours, new Date("2026-10-06T10:00:00+04:00")),
    ).toBe(false); // closed Tuesday
  });
  it("no hours configured means always open", () => {
    expect(isWithinOpeningHours(null, new Date())).toBe(true);
  });
  it("after-hours fee only when allowed", () => {
    const t = new Date("2026-10-05T20:00:00+04:00");
    expect(
      checkAfterHours(
        { openingHours: hours, afterHoursAllowed: true, afterHoursFeeRs: 500 },
        t,
      ),
    ).toEqual({ afterHours: true, allowed: true, feeRs: 500 });
    expect(
      checkAfterHours(
        { openingHours: hours, afterHoursAllowed: false, afterHoursFeeRs: 500 },
        t,
      ).allowed,
    ).toBe(false);
  });
  it("calculatePrice adds the after-hours fee and rejects disallowed after-hours", async () => {
    const hrs = {
      mon: ["08:00", "18:00"] as [string, string],
      tue: ["08:00", "18:00"] as [string, string],
    };
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
      locations: [
        location({
          id: "open",
          openingHours: hrs,
          afterHoursAllowed: true,
          afterHoursFeeRs: 300,
        }),
        location({ id: "strict", openingHours: hrs, afterHoursAllowed: false }),
      ],
    });
    const base = {
      vehicleId: "v1",
      pickupAt: "2026-10-05T20:00:00+04:00",
      returnAt: "2026-10-06T20:00:00+04:00",
    };
    const price = await calculatePrice(db, {
      ...base,
      pickupLocationId: "open",
    });
    expect(price.totalRs).toBe(1000 + 300 + 300); // pickup + return after hours
    await expect(
      calculatePrice(db, { ...base, pickupLocationId: "strict" }),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPENING_HOURS" });
  });
});

describe("vehicle assignment", () => {
  const v = (
    o: Partial<AssignableVehicle> & { id: string },
  ): AssignableVehicle => ({
    currentLocationId: null,
    homeLocationId: null,
    lastUsedAt: null,
    mileage: 0,
    insuranceExpiry: null,
    inspectionExpiry: null,
    ...o,
  });
  const ctx = {
    pickupLocationId: "airport",
    pickupAt: new Date("2026-10-10T10:00:00Z"),
  };
  it("prefers a car already at the pickup location", () => {
    const pick = pickVehicle(
      [
        v({ id: "a", currentLocationId: "town", mileage: 1 }),
        v({ id: "b", currentLocationId: "airport", mileage: 99999 }),
      ],
      ctx,
    );
    expect(pick.id).toBe("b");
  });
  it("then least recently used, then fewest km", () => {
    const here = { currentLocationId: "airport" };
    expect(
      pickVehicle(
        [
          v({ id: "a", ...here, lastUsedAt: "2026-10-01T00:00:00Z" }),
          v({ id: "b", ...here, lastUsedAt: "2026-09-01T00:00:00Z" }),
        ],
        ctx,
      ).id,
    ).toBe("b");
    expect(
      pickVehicle(
        [
          v({ id: "a", ...here, mileage: 500 }),
          v({ id: "b", ...here, mileage: 100 }),
        ],
        ctx,
      ).id,
    ).toBe("b");
  });
  it("never assigns expired insurance/inspection", () => {
    expect(
      hasExpiredPapers(
        v({ id: "x", insuranceExpiry: "2026-01-01" }),
        ctx.pickupAt,
      ),
    ).toBe(true);
    expect(() =>
      pickVehicle([v({ id: "x", inspectionExpiry: "2026-01-01" })], ctx),
    ).toThrow(/valid insurance/);
    expect(
      pickVehicle(
        [v({ id: "x", inspectionExpiry: "2026-01-01" }), v({ id: "y" })],
        ctx,
      ).id,
    ).toBe("y");
  });
  it("strategy is swappable", () => {
    const biggestMileage = (c: AssignableVehicle[]) =>
      [...c].sort((a, b) => b.mileage - a.mileage);
    expect(
      pickVehicle(
        [v({ id: "a", mileage: 1 }), v({ id: "b", mileage: 9 })],
        ctx,
        biggestMileage,
      ).id,
    ).toBe("b");
    expect(defaultStrategy([v({ id: "a" })], ctx)).toHaveLength(1);
  });
});

describe("change request quotes", () => {
  const oldReturn = new Date("2026-10-10T10:00:00+04:00");
  it("late fee: nothing within grace, then 10%/started hour capped at one day", () => {
    expect(lateFeeRs(1000, 30)).toBe(0);
    expect(lateFeeRs(1000, 60)).toBe(0);
    expect(lateFeeRs(1000, 61)).toBe(100);
    expect(lateFeeRs(1000, 180)).toBe(200);
    expect(lateFeeRs(1000, 24 * 60)).toBe(1000);
  });
  it("extension charges whole extra days (with grace)", () => {
    expect(
      additionalDays(oldReturn, new Date("2026-10-11T10:30:00+04:00")),
    ).toBe(1);
    expect(
      additionalDays(oldReturn, new Date("2026-10-12T10:00:00+04:00")),
    ).toBe(2);
    expect(
      additionalDays(oldReturn, new Date("2026-10-10T09:00:00+04:00")),
    ).toBe(0);
  });
  it("quotes per type", () => {
    expect(
      quoteAdditionalRs({
        type: "EXTENSION",
        dailyPriceRs: 1500,
        currentReturnAt: oldReturn,
        newReturnAt: new Date("2026-10-12T10:00:00+04:00"),
      }),
    ).toBe(3000);
    expect(
      quoteAdditionalRs({
        type: "RETURN_DELAY",
        dailyPriceRs: 1000,
        currentReturnAt: oldReturn,
        newReturnAt: new Date("2026-10-10T13:00:00+04:00"),
      }),
    ).toBe(200);
    expect(
      quoteAdditionalRs({
        type: "CANCELLATION",
        dailyPriceRs: 1000,
        currentReturnAt: oldReturn,
      }),
    ).toBe(0);
  });
});

describe("takeover", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("24h window", () => {
    expect(isWithin24hWindow("2026-10-05T01:00:00Z", now)).toBe(true);
    expect(isWithin24hWindow("2026-10-03T01:00:00Z", now)).toBe(false);
    expect(isWithin24hWindow(null, now)).toBe(false);
  });
  it("reminder after 12h of silence, once, never in AI mode", () => {
    const conv = {
      mode: "HUMAN",
      taken_over_at: "2026-10-04T23:00:00Z",
      last_owner_message_at: null,
      takeover_reminder_sent_at: null,
    };
    expect(needsTakeoverReminder(conv, now)).toBe(true);
    expect(
      needsTakeoverReminder(
        { ...conv, last_owner_message_at: "2026-10-05T10:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      needsTakeoverReminder(
        { ...conv, takeover_reminder_sent_at: "2026-10-05T11:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(needsTakeoverReminder({ ...conv, mode: "AI" }, now)).toBe(false);
  });
});

describe("fleet alerts & inbox priority", () => {
  it("alerts 14 days before expiry, when expired, and when service is due", () => {
    const a = vehicleAlerts(
      {
        insurance_expiry: "2026-10-15",
        inspection_expiry: "2026-09-01",
        next_service_due: "2026-10-05",
      },
      "2026-10-05",
    );
    expect(a).toHaveLength(3);
    expect(
      vehicleAlerts(
        {
          insurance_expiry: "2027-01-01",
          inspection_expiry: null,
          next_service_due: "2027-01-01",
        },
        "2026-10-05",
      ),
    ).toEqual([]);
  });
  it("priority colours", () => {
    expect(
      conversationPriority({
        mode: "AI",
        openNotificationTypes: ["NEEDS_HUMAN"],
      }),
    ).toBe("red");
    expect(
      conversationPriority({
        mode: "AI",
        documentStatus: "REJECTED",
        openNotificationTypes: [],
      }),
    ).toBe("red");
    expect(
      conversationPriority({
        mode: "AI",
        openNotificationTypes: ["CASH_ISSUE"],
      }),
    ).toBe("amber");
    expect(
      conversationPriority({ mode: "AI", openNotificationTypes: [] }),
    ).toBe("green");
  });
});
