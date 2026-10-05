import { describe, expect, it } from "vitest";
import {
  computeDueMessages,
  isDigestDue,
  type ScheduleBooking,
} from "./schedule";

const base: ScheduleBooking = {
  id: "b1",
  customerId: "c1",
  status: "CONFIRMED",
  pickupAt: "2026-10-10T09:00:00+04:00",
  returnAt: "2026-10-13T09:00:00+04:00",
  pendingDocumentsSince: null,
  documentStatus: "VERIFIED",
  optedOut: false,
};
const kinds = (b: ScheduleBooking[], now: string, sent = new Set<string>()) =>
  computeDueMessages(b, sent, new Date(now)).map((d) => d.kind);

describe("computeDueMessages", () => {
  it("pickup reminder: day before at 18:00 Mauritius, not earlier", () => {
    expect(kinds([base], "2026-10-09T17:59:00+04:00")).toEqual([]);
    expect(kinds([base], "2026-10-09T18:00:00+04:00")).toEqual([
      "pickup_reminder",
    ]);
  });
  it("never sends twice", () => {
    expect(
      kinds(
        [base],
        "2026-10-09T19:00:00+04:00",
        new Set(["b1:pickup_reminder"]),
      ),
    ).toEqual([]);
  });
  it("pickup-day message 2h before", () => {
    expect(kinds([base], "2026-10-10T06:59:00+04:00")).not.toContain(
      "pickup_day",
    );
    expect(kinds([base], "2026-10-10T07:00:00+04:00")).toContain("pickup_day");
  });
  it("return reminder on the morning of return day for picked-up cars", () => {
    const b = { ...base, status: "PICKED_UP" };
    expect(kinds([b], "2026-10-13T07:00:00+04:00")).toEqual([]);
    expect(kinds([b], "2026-10-13T08:00:00+04:00")).toEqual([
      "return_reminder",
    ]);
  });
  it("thank-you after return", () => {
    expect(
      kinds([{ ...base, status: "COMPLETED" }], "2026-10-14T10:00:00+04:00"),
    ).toEqual(["thank_you"]);
  });
  it("document nudges at 24h and 48h, owner alert at 72h", () => {
    const b: ScheduleBooking = {
      ...base,
      status: "PENDING_DOCUMENTS",
      documentStatus: "NOT_SUBMITTED",
      pendingDocumentsSince: "2026-10-01T10:00:00Z",
    };
    expect(kinds([b], "2026-10-02T09:00:00Z")).toEqual([]);
    expect(kinds([b], "2026-10-02T11:00:00Z")).toEqual(["docs_nudge_1"]);
    expect(kinds([b], "2026-10-03T11:00:00Z")).toEqual(["docs_nudge_2"]);
    expect(kinds([b], "2026-10-04T11:00:00Z")).toEqual([
      "docs_owner_alert",
      "docs_nudge_2",
    ]);
  });
  it("opt-out suppresses customer messages but not the owner alert", () => {
    const b: ScheduleBooking = {
      ...base,
      optedOut: true,
      status: "PENDING_DOCUMENTS",
      documentStatus: "NOT_SUBMITTED",
      pendingDocumentsSince: "2026-10-01T10:00:00Z",
    };
    expect(kinds([b], "2026-10-04T11:00:00Z")).toEqual(["docs_owner_alert"]);
    expect(
      kinds([{ ...base, optedOut: true }], "2026-10-09T19:00:00+04:00"),
    ).toEqual([]);
  });
  it("owner digest is due from 07:30 once a day", () => {
    expect(isDigestDue(new Date("2026-10-05T07:29:00+04:00"), null)).toBe(
      false,
    );
    expect(isDigestDue(new Date("2026-10-05T07:30:00+04:00"), null)).toBe(true);
    expect(
      isDigestDue(new Date("2026-10-05T09:00:00+04:00"), "2026-10-05"),
    ).toBe(false);
  });
});
