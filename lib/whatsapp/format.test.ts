import { describe, expect, it } from "vitest";
import {
  buildListMessage,
  buildReplyButtonsMessage,
  formatBookingSummaryText,
  formatFleetListText,
  formatMauritiusDateTime,
  formatPriceRs,
  truncate,
} from "./format";
import type { FleetGroup } from "@/lib/domain/getFleet";

describe("truncate", () => {
  it("returns the string unchanged if it fits", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("cuts and appends an ellipsis when it doesn't fit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
    expect(truncate("hello world", 8).length).toBe(8);
  });

  it("handles a max length of 0 or 1 without throwing", () => {
    expect(truncate("hello", 1)).toBe("h");
    expect(truncate("hello", 0)).toBe("");
  });
});

describe("formatPriceRs", () => {
  it("formats with thousands separators and no decimals", () => {
    expect(formatPriceRs(7500)).toBe("Rs 7,500");
    expect(formatPriceRs(1200)).toBe("Rs 1,200");
    expect(formatPriceRs(0)).toBe("Rs 0");
  });

  it("rounds fractional amounts", () => {
    expect(formatPriceRs(1200.6)).toBe("Rs 1,201");
  });
});

describe("formatMauritiusDateTime", () => {
  it("renders a UTC instant in Indian/Mauritius local time (UTC+4)", () => {
    // 20:00 UTC -> 00:00 the next day in Mauritius.
    expect(formatMauritiusDateTime("2026-02-01T20:00:00Z")).toBe(
      "2 Feb 2026, 00:00",
    );
  });
});

const fleetGroup = (overrides: Partial<FleetGroup> = {}): FleetGroup => ({
  categoryId: "cat-1",
  categoryName: "Economy",
  make: "Toyota",
  model: "Vitz",
  dailyPriceRs: 1200,
  transmission: "Manual",
  seats: 5,
  photoUrl: null,
  total: 2,
  vehicleIds: ["v1", "v2"],
  ...overrides,
});

describe("formatFleetListText", () => {
  it("formats a message for no availability", () => {
    expect(formatFleetListText([])).toMatch(
      /don't have any vehicles available/,
    );
  });

  it("formats each group with bold name, price, and details", () => {
    const text = formatFleetListText([fleetGroup()]);
    expect(text).toContain("*Toyota Vitz*");
    expect(text).toContain("Rs 1,200/day");
    expect(text).toContain("Manual");
    expect(text).toContain("5 seats");
  });

  it("includes the availability count when present", () => {
    const text = formatFleetListText([fleetGroup({ available: 3 })]);
    expect(text).toContain("3 available");
  });
});

describe("formatBookingSummaryText", () => {
  it("includes vehicle, dates, location and a priced breakdown", () => {
    const text = formatBookingSummaryText({
      vehicleMake: "Toyota",
      vehicleModel: "Vitz",
      pickupAt: "2026-02-01T06:00:00Z",
      returnAt: "2026-02-03T06:00:00Z",
      pickupLocationName: "Grand Baie",
      rentalDays: 2,
      lineItems: [{ label: "2 days", amountRs: 2400 }],
      totalRs: 2400,
    });
    expect(text).toContain("*Booking summary*");
    expect(text).toContain("Toyota Vitz");
    expect(text).toContain("Grand Baie");
    expect(text).toContain("2 days: Rs 2,400");
    expect(text).toContain("*Total: Rs 2,400*");
  });

  it("adds a drop-off line only when it differs from pickup", () => {
    const base = {
      vehicleMake: "Toyota",
      vehicleModel: "Vitz",
      pickupAt: "2026-02-01T06:00:00Z",
      returnAt: "2026-02-03T06:00:00Z",
      pickupLocationName: "Grand Baie",
      rentalDays: 2,
      lineItems: [],
      totalRs: 0,
    };
    expect(
      formatBookingSummaryText({ ...base, dropoffLocationName: "Grand Baie" }),
    ).not.toContain("Drop-off");
    expect(
      formatBookingSummaryText({ ...base, dropoffLocationName: "Port Louis" }),
    ).toContain("📍 Drop-off: Port Louis");
  });
});

describe("buildListMessage", () => {
  it("builds a list section from rows", () => {
    const message = buildListMessage({
      bodyText: "Pick a car",
      buttonText: "See options",
      rows: [{ id: "v1", title: "Toyota Vitz", description: "Rs 1,200/day" }],
    });
    expect(message).toEqual({
      type: "list",
      body: { text: "Pick a car" },
      action: {
        button: "See options",
        sections: [
          {
            rows: [
              { id: "v1", title: "Toyota Vitz", description: "Rs 1,200/day" },
            ],
          },
        ],
      },
    });
  });

  it("caps rows at 10 and truncates long titles/descriptions/button text", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      title: `Vehicle number ${i} deluxe edition`,
    }));
    const message = buildListMessage({
      bodyText: "b",
      buttonText: "A very long button label indeed",
      rows,
    });
    expect(message.action.sections[0].rows).toHaveLength(10);
    for (const row of message.action.sections[0].rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
    }
    expect(message.action.button.length).toBeLessThanOrEqual(20);
  });
});

describe("buildReplyButtonsMessage", () => {
  it("builds reply buttons", () => {
    const message = buildReplyButtonsMessage({
      bodyText: "Confirm?",
      buttons: [
        { id: "yes", title: "Yes" },
        { id: "no", title: "No" },
      ],
    });
    expect(message.action.buttons).toEqual([
      { type: "reply", reply: { id: "yes", title: "Yes" } },
      { type: "reply", reply: { id: "no", title: "No" } },
    ]);
  });

  it("caps buttons at 3 and truncates long titles", () => {
    const buttons = [
      { id: "1", title: "This title is definitely too long for a button" },
      { id: "2", title: "b" },
      { id: "3", title: "c" },
      { id: "4", title: "d" },
    ];
    const message = buildReplyButtonsMessage({ bodyText: "b", buttons });
    expect(message.action.buttons).toHaveLength(3);
    expect(message.action.buttons[0].reply.title.length).toBeLessThanOrEqual(
      20,
    );
  });
});
