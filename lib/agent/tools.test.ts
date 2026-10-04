import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeTool, type ToolContext } from "./tools";
import {
  createAgentFixture,
  LOCATION_AIRPORT,
  VEHICLE_VITARA,
  VEHICLE_VITZ,
} from "./testing/fixtures";
import type { CustomerRow } from "@/lib/whatsapp/ports";

function parse(content: string) {
  return JSON.parse(content) as {
    ok: boolean;
    data?: unknown;
    error?: unknown;
  };
}

async function makeCtx() {
  const { fakeDb, fakeMessaging } = createAgentFixture();
  const customer: CustomerRow =
    await fakeMessaging.db.findOrCreateCustomer("+23057611111");
  const ctx: ToolContext = {
    domainDb: fakeDb.db,
    messaging: fakeMessaging.db,
    customer,
    conversationId: "conv-1",
    state: {},
    now: new Date("2026-10-01T08:00:00Z"),
  };
  return { ctx, fakeDb, fakeMessaging, customer };
}

describe("get_fleet", () => {
  it("returns every active vehicle grouped by make/model", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool("get_fleet", {}, ctx);
    const { data } = parse(result.content) as { data: { groups: unknown[] } };
    expect(data.groups).toHaveLength(3);
  });
});

describe("check_availability", () => {
  it("resolves a category name to filter results", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool(
      "check_availability",
      {
        pickupAt: "2026-11-01T10:00:00Z",
        returnAt: "2026-11-05T10:00:00Z",
        category: "SUV",
      },
      ctx,
    );
    const { data } = parse(result.content) as {
      data: { groups: { make: string; model: string }[] };
    };
    expect(data.groups).toEqual([
      expect.objectContaining({ make: "Suzuki", model: "Vitara" }),
    ]);
  });

  it("returns a domain error for an invalid date range", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool(
      "check_availability",
      { pickupAt: "2026-11-05T10:00:00Z", returnAt: "2026-11-01T10:00:00Z" },
      ctx,
    );
    expect(result.isError).toBe(true);
    const { error } = parse(result.content) as { error: { code: string } };
    expect(error.code).toBe("INVALID_DATES");
  });
});

describe("get_knowledge", () => {
  it("finds the cash-only FAQ", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool(
      "get_knowledge",
      { query: "credit card" },
      ctx,
    );
    const { data } = parse(result.content) as {
      data: { entries: { answer: string }[] };
    };
    expect(data.entries[0].answer).toMatch(/cash/i);
  });
});

describe("start_or_update_booking_draft", () => {
  it("creates a draft on first use and tracks it on state", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const { data } = parse(result.content) as {
      data: { bookingId: string; status: string };
    };
    expect(ctx.state.draftBookingId).toBe(data.bookingId);
    expect(data.status).toBe("CAR_SELECTED");
  });

  it("accumulates fields across calls and prices the booking once complete", async () => {
    const { ctx } = await makeCtx();
    await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const result = await executeTool(
      "start_or_update_booking_draft",
      {
        pickupAt: "2026-11-01T10:00:00Z",
        returnAt: "2026-11-05T10:00:00Z",
        pickupLocationId: LOCATION_AIRPORT.id,
      },
      ctx,
    );
    const { data } = parse(result.content) as {
      data: { status: string; totalRs: number | null };
    };
    expect(data.status).toBe("DATES_SELECTED");
    expect(data.totalRs).toBe(
      4 * VEHICLE_VITZ.dailyPriceRs + LOCATION_AIRPORT.extraFeeRs,
    );
  });

  it("updates the customer's full name", async () => {
    const { ctx, fakeMessaging, customer } = await makeCtx();
    await executeTool(
      "start_or_update_booking_draft",
      { customerFullName: "Jean Baptiste" },
      ctx,
    );
    const stored = fakeMessaging.customers.get(customer.whatsappNumber);
    expect(stored?.fullName).toBe("Jean Baptiste");
  });

  it("starts a fresh draft if the tracked one is no longer editable", async () => {
    const { ctx } = await makeCtx();
    const first = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const firstId = (parse(first.content).data as { bookingId: string })
      .bookingId;
    await ctx.domainDb.updateBooking(firstId, { status: "CANCELLED" });

    const second = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITARA.id },
      ctx,
    );
    const secondData = parse(second.content).data as {
      bookingId: string;
      vehicleId: string;
    };
    expect(secondData.bookingId).not.toBe(firstId);
    expect(secondData.vehicleId).toBe(VEHICLE_VITARA.id);
    expect(ctx.state.draftBookingId).toBe(secondData.bookingId);
  });
});

describe("get_price_quote / confirm_booking", () => {
  async function makeQuotedDraft() {
    const setup = await makeCtx();
    await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      setup.ctx,
    );
    const updated = await executeTool(
      "start_or_update_booking_draft",
      {
        pickupAt: "2026-11-01T10:00:00Z",
        returnAt: "2026-11-05T10:00:00Z",
        pickupLocationId: LOCATION_AIRPORT.id,
      },
      setup.ctx,
    );
    const bookingId = (parse(updated.content).data as { bookingId: string })
      .bookingId;
    return { ...setup, bookingId };
  }

  it("get_price_quote returns a formatted summary and marks the draft as quoted", async () => {
    const { ctx, bookingId } = await makeQuotedDraft();
    const result = await executeTool("get_price_quote", { bookingId }, ctx);
    const { data } = parse(result.content) as {
      data: { summaryText: string; totalRs: number };
    };
    expect(data.summaryText).toMatch(/Booking summary/);
    expect(data.totalRs).toBe(
      4 * VEHICLE_VITZ.dailyPriceRs + LOCATION_AIRPORT.extraFeeRs,
    );
    expect(ctx.state.summaryShown).toBe(true);
  });

  it("confirm_booking refuses without a prior get_price_quote", async () => {
    const { ctx, bookingId } = await makeQuotedDraft();
    const result = await executeTool("confirm_booking", { bookingId }, ctx);
    expect(result.isError).toBe(true);
    const { error } = parse(result.content) as { error: { code: string } };
    expect(error.code).toBe("SUMMARY_NOT_CONFIRMED");
  });

  it("confirm_booking succeeds once the summary has been shown", async () => {
    const { ctx, bookingId } = await makeQuotedDraft();
    await executeTool("get_price_quote", { bookingId }, ctx);
    const result = await executeTool("confirm_booking", { bookingId }, ctx);
    const { data } = parse(result.content) as { data: { status: string } };
    expect(data.status).toBe("PENDING_DOCUMENTS");
    expect(ctx.state.summaryShown).toBe(false);
  });
});

describe("send_document_upload_link", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://app.example.com";
  });
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("errors when the booking has no upload token yet", async () => {
    const { ctx } = await makeCtx();
    const draft = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const bookingId = (parse(draft.content).data as { bookingId: string })
      .bookingId;
    const result = await executeTool(
      "send_document_upload_link",
      { bookingId },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("builds the upload URL from APP_URL once confirmed", async () => {
    const { ctx } = await makeCtx();
    await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const updated = await executeTool(
      "start_or_update_booking_draft",
      {
        pickupAt: "2026-11-01T10:00:00Z",
        returnAt: "2026-11-05T10:00:00Z",
        pickupLocationId: LOCATION_AIRPORT.id,
      },
      ctx,
    );
    const bookingId = (parse(updated.content).data as { bookingId: string })
      .bookingId;
    await executeTool("get_price_quote", { bookingId }, ctx);
    await executeTool("confirm_booking", { bookingId }, ctx);

    const result = await executeTool(
      "send_document_upload_link",
      { bookingId },
      ctx,
    );
    const { data } = parse(result.content) as { data: { url: string } };
    expect(data.url).toBe(
      `https://app.example.com/documents/${(await ctx.domainDb.getBookingById(bookingId))!.uploadToken}`,
    );
  });
});

describe("record_customer_update", () => {
  it("maps PICKUP_TIME_CHANGE to the DB's PICKUP_CHANGE type and never touches the booking", async () => {
    const { ctx, fakeMessaging } = await makeCtx();
    const draft = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const bookingId = (parse(draft.content).data as { bookingId: string })
      .bookingId;
    const before = await ctx.domainDb.getBookingById(bookingId);

    await executeTool(
      "record_customer_update",
      {
        bookingId,
        type: "PICKUP_TIME_CHANGE",
        details: "Can we push pickup to 6pm?",
      },
      ctx,
    );

    expect(fakeMessaging.notifications).toHaveLength(1);
    expect(fakeMessaging.notifications[0]).toMatchObject({
      type: "PICKUP_CHANGE",
      bookingId,
    });
    const after = await ctx.domainDb.getBookingById(bookingId);
    expect(after).toEqual(before);
  });
});

describe("escalate_to_human", () => {
  it("switches the conversation to HUMAN and escalates the active booking", async () => {
    const { ctx, fakeMessaging, customer } = await makeCtx();
    const conversation = await fakeMessaging.db.getOrCreateConversation(
      customer.id,
    );
    ctx.conversationId = conversation.id;

    const draft = await executeTool(
      "start_or_update_booking_draft",
      { vehicleId: VEHICLE_VITZ.id },
      ctx,
    );
    const bookingId = (parse(draft.content).data as { bookingId: string })
      .bookingId;
    // start_or_update_booking_draft leaves the booking in CAR_SELECTED, a
    // draft status — bump it further so it's a real "active" booking to escalate.
    await ctx.domainDb.updateBooking(bookingId, { status: "CONFIRMED" });

    await executeTool(
      "escalate_to_human",
      { reason: "Reported an accident" },
      ctx,
    );

    const updatedConversation = await fakeMessaging.db.getConversationById(
      conversation.id,
    );
    expect(updatedConversation?.mode).toBe("HUMAN");
    expect(fakeMessaging.notifications).toContainEqual(
      expect.objectContaining({ type: "NEEDS_HUMAN" }),
    );
    const booking = await ctx.domainDb.getBookingById(bookingId);
    expect(booking?.status).toBe("NEEDS_HUMAN");
  });
});

describe("verify_returning_customer", () => {
  /** A second customer (new number) sharing the first's domainDb/messaging, so the booking it's asking about actually exists for it to find. */
  async function makeNewNumberCtx(
    fakeMessaging: Awaited<ReturnType<typeof makeCtx>>["fakeMessaging"],
    ctx: ToolContext,
  ): Promise<ToolContext> {
    const newCustomer =
      await fakeMessaging.db.findOrCreateCustomer("+23057655555");
    return { ...ctx, customer: newCustomer };
  }

  it("never returns booking details, even on a match — it only flags the number for the team", async () => {
    const { ctx, fakeDb, fakeMessaging } = await makeCtx();
    const owner = await fakeMessaging.db.findOrCreateCustomer("+23057699999");
    await fakeMessaging.db.updateCustomerFullName(owner.id, "Jean Paul Dupont");
    const theirBooking = await fakeDb.db.createBooking(owner.id);
    const newNumberCtx = await makeNewNumberCtx(fakeMessaging, ctx);

    const result = await executeTool(
      "verify_returning_customer",
      {
        bookingNumber: theirBooking.bookingNumber,
        fullName: "Jean Paul Dupont",
      },
      newNumberCtx,
    );

    const { data } = parse(result.content) as {
      data: Record<string, unknown>;
    };
    expect(data).toEqual({ verified: true, pendingOwnerApproval: true });
    expect(fakeMessaging.notifications).toContainEqual(
      expect.objectContaining({ type: "OTHER", bookingId: theirBooking.id }),
    );
  });

  it("does not create a notification and reports unverified on a name mismatch", async () => {
    const { ctx, fakeDb, fakeMessaging } = await makeCtx();
    const owner = await fakeMessaging.db.findOrCreateCustomer("+23057688888");
    await fakeMessaging.db.updateCustomerFullName(owner.id, "Jean Paul Dupont");
    const theirBooking = await fakeDb.db.createBooking(owner.id);
    const newNumberCtx = await makeNewNumberCtx(fakeMessaging, ctx);

    const result = await executeTool(
      "verify_returning_customer",
      { bookingNumber: theirBooking.bookingNumber, fullName: "Wrong Name" },
      newNumberCtx,
    );

    const { data } = parse(result.content) as { data: { verified: boolean } };
    expect(data.verified).toBe(false);
    expect(fakeMessaging.notifications).toHaveLength(0);
  });

  it("reports unverified for a booking number that doesn't exist", async () => {
    const { ctx } = await makeCtx();
    const result = await executeTool(
      "verify_returning_customer",
      { bookingNumber: 999999, fullName: "Anyone" },
      ctx,
    );
    const { data } = parse(result.content) as { data: { verified: boolean } };
    expect(data.verified).toBe(false);
  });
});
