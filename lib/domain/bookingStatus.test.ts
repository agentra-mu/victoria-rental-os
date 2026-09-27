import { describe, expect, it } from "vitest";
import {
  assertTransition,
  BOOKING_STATUSES,
  canTransition,
  isActiveStatus,
} from "./bookingStatus";
import { DomainError } from "./errors";

describe("bookingStatus", () => {
  it("allows every step of the CLAUDE.md happy path", () => {
    const path = [
      "ENQUIRY",
      "CAR_SELECTED",
      "DATES_SELECTED",
      "PENDING_DOCUMENTS",
      "DOCUMENTS_VERIFIED",
      "CONFIRMED",
      "PICKED_UP",
      "RETURNED",
      "COMPLETED",
    ] as const;

    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("lets the three draft statuses move freely in either direction", () => {
    // updateBookingDraft can set vehicle + dates in one call, so ENQUIRY can
    // jump straight to DATES_SELECTED, and fields can be cleared again.
    expect(canTransition("ENQUIRY", "DATES_SELECTED")).toBe(true);
    expect(canTransition("DATES_SELECTED", "CAR_SELECTED")).toBe(true);
    expect(canTransition("DATES_SELECTED", "ENQUIRY")).toBe(true);
  });

  it("rejects skipping steps or going backwards once past the draft stage", () => {
    expect(canTransition("PENDING_DOCUMENTS", "CONFIRMED")).toBe(false);
    expect(canTransition("CONFIRMED", "CAR_SELECTED")).toBe(false);
    expect(canTransition("PENDING_DOCUMENTS", "ENQUIRY")).toBe(false);
  });

  it("allows CANCELLED and NEEDS_HUMAN from every active status", () => {
    for (const status of BOOKING_STATUSES) {
      if (!isActiveStatus(status)) continue;
      expect(canTransition(status, "CANCELLED")).toBe(true);
      if (status !== "NEEDS_HUMAN") {
        expect(canTransition(status, "NEEDS_HUMAN")).toBe(true);
      }
    }
  });

  it("has no transitions out of terminal statuses", () => {
    for (const to of BOOKING_STATUSES) {
      if (to === "CANCELLED") continue;
      expect(canTransition("CANCELLED", to)).toBe(false);
      expect(canTransition("COMPLETED", to)).toBe(false);
    }
  });

  it("lets a human resolve NEEDS_HUMAN back into any other active status", () => {
    expect(canTransition("NEEDS_HUMAN", "CONFIRMED")).toBe(true);
    expect(canTransition("NEEDS_HUMAN", "ENQUIRY")).toBe(true);
    expect(canTransition("NEEDS_HUMAN", "COMPLETED")).toBe(false);
  });

  it("assertTransition throws a DomainError with code ILLEGAL_TRANSITION", () => {
    expect(() => assertTransition("ENQUIRY", "CONFIRMED")).toThrow(DomainError);
    try {
      assertTransition("ENQUIRY", "CONFIRMED");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("ILLEGAL_TRANSITION");
    }
  });

  it("assertTransition is a no-op for legal transitions", () => {
    expect(() => assertTransition("ENQUIRY", "CAR_SELECTED")).not.toThrow();
  });
});
