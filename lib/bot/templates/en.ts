import { formatMauritiusDateTime, formatPriceRs } from "@/lib/whatsapp/format";
import { buttonsReply, listReply, textReply } from "@/lib/whatsapp/replies";
import { COMPANY_NAME } from "../config";
import { IDS, bookingPickId, carId, locId } from "../ids";
import type { CarOption } from "../parsers/car";
import { timeLabel } from "../parsers/localTime";
import type { ChangeKind } from "../types";
import type { StatusCardData, Templates } from "./types";

const dt = (v: string) => formatMauritiusDateTime(v);

const MENU_ROWS = [
  { id: IDS.menu.viewCars, title: "View cars" },
  { id: IDS.menu.checkAvailability, title: "Check availability" },
  { id: IDS.menu.existingBooking, title: "Existing booking" },
  { id: IDS.menu.talkHuman, title: "Talk to someone" },
];

const carRows = (cars: CarOption[]) =>
  cars.map((c) => ({
    id: carId(c.id),
    title: `${c.make} ${c.model}`,
    description: `${formatPriceRs(c.dailyPriceRs)}/day${[c.transmission, c.seats ? `${c.seats} seats` : null].filter(Boolean).length ? ` · ${[c.transmission, c.seats ? `${c.seats} seats` : null].filter(Boolean).join(" · ")}` : ""}`,
  }));

const locRows = (locs: { id: string; name: string }[]) =>
  locs.map((l) => ({ id: locId(l.id), title: l.name }));

const navButtons = [
  { id: IDS.nav.back, title: "Back" },
  { id: IDS.menu.main, title: "Main menu" },
  { id: IDS.menu.talkHuman, title: "Talk to someone" },
];

const STATUS: Record<string, string> = {
  ENQUIRY: "Enquiry",
  CAR_SELECTED: "Car selected",
  DATES_SELECTED: "Dates selected",
  PENDING_DOCUMENTS: "Waiting for your documents",
  DOCUMENTS_VERIFIED: "Documents verified",
  CONFIRMED: "Confirmed",
  PICKED_UP: "Car collected",
  RETURNED: "Car returned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NEEDS_HUMAN: "With our team",
};
const DOCS: Record<string, string> = {
  NOT_SUBMITTED: "not received yet",
  PENDING: "received, waiting for review",
  NEEDS_REVIEW: "with our team for review",
  VERIFIED: "verified",
  REJECTED: "our team will contact you about them",
};
const PAYMENT: Record<string, string> = {
  UNPAID: "cash on collection",
  PAID: "recorded as paid by our team",
  REFUNDED: "refunded",
};

function card(d: StatusCardData): string {
  const lines = [
    `*Booking #${d.bookingNumber}* — ${STATUS[d.status] ?? d.status}`,
    d.carName ? `🚗 ${d.carName}` : null,
    d.pickupAt && d.returnAt
      ? `📅 ${dt(d.pickupAt)} → ${dt(d.returnAt)}`
      : null,
    d.pickupLocation ? `📍 Pickup: ${d.pickupLocation}` : null,
    d.dropoffLocation && d.dropoffLocation !== d.pickupLocation
      ? `📍 Drop-off: ${d.dropoffLocation}`
      : null,
    d.totalRs !== null ? `💰 Total: ${formatPriceRs(d.totalRs)}` : null,
    `Payment: ${PAYMENT[d.paymentStatus] ?? d.paymentStatus}`,
    `Documents: ${DOCS[d.documentStatus] ?? d.documentStatus}`,
  ];
  return lines.filter(Boolean).join("\n");
}

const CHANGE_LABEL: Record<ChangeKind, string> = {
  RETURN_DELAY: "late return",
  EXTENSION: "extension",
  PICKUP_TIME_CHANGE: "pickup time change",
  CANCELLATION: "cancellation",
};

export const en: Templates = {
  menu: () =>
    listReply(
      `Welcome to ${COMPANY_NAME}! How can we help today?`,
      "Menu",
      MENU_ROWS,
    ),
  unknown: () =>
    listReply(
      "Sorry, I didn't understand that. What would you like to do?",
      "Menu",
      MENU_ROWS,
    ),
  stuck: () =>
    buttonsReply(
      "I'm having trouble understanding. You can go back, start again from the menu, or talk to someone on our team.",
      navButtons,
    ),
  humanHandoff: () =>
    textReply(
      "Thanks — a member of our team will be in touch with you shortly.",
    ),
  humanAlreadyNotified: () =>
    textReply(
      "Our team has your request and will reply here as soon as they can.",
    ),
  optedOut: () =>
    textReply(
      "You won't receive reminders any more. Reply START to receive them again.",
    ),
  optedIn: () => textReply("Reminders are back on. Thank you!"),
  draftCancelled: () =>
    buttonsReply(
      "No problem — I've cancelled that booking request. Anything else?",
      [
        { id: IDS.menu.main, title: "Main menu" },
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
      ],
    ),
  nothingToCancel: () =>
    buttonsReply(
      "There's no booking request in progress to cancel. To cancel a confirmed booking, open Existing booking.",
      [
        { id: IDS.menu.existingBooking, title: "Existing booking" },
        { id: IDS.menu.main, title: "Main menu" },
      ],
    ),
  mediaNotAccepted: (url) =>
    textReply(
      url
        ? `For your security, please send your documents only through your private upload link:\n${url}`
        : "Thanks! Please use the buttons or type your message and I'll help from there.",
    ),
  genericError: () =>
    buttonsReply(
      "Sorry, something went wrong on our side. You can try again or talk to someone on our team.",
      [
        { id: IDS.menu.main, title: "Main menu" },
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
      ],
    ),

  carList: (cars, mode) =>
    listReply(
      mode === "available"
        ? "These cars are available for your dates. Which one would you like?"
        : "Here are our cars. Which one would you like?",
      "See cars",
      carRows(cars),
    ),
  carNotUnderstood: (cars) =>
    listReply(
      "I couldn't find that car. Please pick one from the list.",
      "See cars",
      carRows(cars),
    ),
  carAmbiguous: (cars) =>
    listReply("Which of these did you mean?", "See cars", carRows(cars)),
  carSelected: (car) =>
    `Great choice — the ${car.make} ${car.model}, ${formatPriceRs(car.dailyPriceRs)}/day.`,

  askPickupDateTime: () =>
    textReply(
      "When would you like to pick up the car? Please give a date and time, for example _tomorrow 9am_ or _12 Oct 10:00_. You can also give both dates, like _12 to 17 Oct_.",
    ),
  askReturnDateTime: (pickup) =>
    textReply(
      `Pickup: ${pickup}.\nWhen will you return the car? Give a date and time, or the number of days (for example _5 days_).`,
    ),
  askTime: (date) =>
    buttonsReply(
      `What time on ${date}?`,
      ["09:00", "12:00", "17:00"].map((t) => ({
        id: `time:${t}`,
        title: timeLabel(t, "en"),
      })),
    ),
  askMeridiem: (options) =>
    buttonsReply(
      "Is that morning or evening?",
      options.map((t) => ({ id: `time:${t}`, title: timeLabel(t, "en") })),
    ),
  askWhichDate: (options) =>
    buttonsReply(
      "Which date did you mean?",
      options.map((o) => ({ id: `date:${o.iso}`, title: o.label })),
    ),
  dateNotUnderstood: () =>
    textReply(
      "Sorry, I couldn't read that date. Try something like _tomorrow 9am_, _12 Oct 10:00_ or _next Friday 2pm_.",
    ),
  datePast: () =>
    textReply(
      "That date or time has already passed. Please give a future date and time.",
    ),
  returnBeforePickup: () =>
    textReply(
      "The return must be after the pickup. Please give a later return date and time.",
    ),
  noAvailabilityForDates: () =>
    buttonsReply(
      "Sorry, we have no cars available for those dates. Would you like to try different dates?",
      [
        { id: IDS.menu.checkAvailability, title: "Try other dates" },
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
      ],
    ),

  askPickupLocation: (locs) =>
    listReply(
      "Where would you like to pick up the car?",
      "Locations",
      locRows(locs),
    ),
  askDropoffLocation: (locs, pickup) =>
    listReply(
      `Where will you return it? Pickup is at ${pickup}.`,
      "Locations",
      [{ id: IDS.loc.same, title: "Same as pickup" }, ...locRows(locs)].slice(
        0,
        10,
      ),
    ),
  locationNotUnderstood: (locs) =>
    listReply(
      "I didn't recognise that location. Please choose from the list.",
      "Locations",
      locRows(locs),
    ),
  locationAmbiguous: (locs) =>
    listReply("Which of these did you mean?", "Locations", locRows(locs)),

  askName: (existing) =>
    existing
      ? buttonsReply(
          `What's the full name for the booking, exactly as on your passport or driving permit? Or keep *${existing}*.`,
          [
            { id: IDS.name.keep, title: "Keep this name" },
            { id: IDS.nav.back, title: "Back" },
          ],
        )
      : textReply(
          "What's your full name, exactly as printed on your passport or driving permit?",
        ),
  nameInvalid: (reason) =>
    textReply(
      reason === "ONE_WORD"
        ? "Please give your first and last name, exactly as on your passport or driving permit."
        : "That doesn't look like a full name. Please type just your first and last name, using letters only.",
    ),

  summary: (s) =>
    buttonsReply(
      [
        "*Booking summary*",
        `🚗 ${s.carName}`,
        `📅 ${dt(s.pickupAt)} → ${dt(s.returnAt)} (${s.rentalDays} day${s.rentalDays === 1 ? "" : "s"})`,
        `📍 Pickup: ${s.pickupLocation}`,
        ...(s.dropoffLocation !== s.pickupLocation
          ? [`📍 Drop-off: ${s.dropoffLocation}`]
          : []),
        `👤 Name: ${s.customerName}`,
        "",
        ...s.lineItems.map((i) => `${i.label}: ${formatPriceRs(i.amountRs)}`),
        `*Total: ${formatPriceRs(s.totalRs)}* — payable in cash when you collect the car.`,
        "",
        "Is everything correct?",
      ].join("\n"),
      [
        { id: IDS.confirm.yes, title: "Confirm" },
        { id: IDS.confirm.change, title: "Change details" },
        { id: IDS.confirm.cancel, title: "Cancel" },
      ],
    ),
  changeMenu: () =>
    listReply("What would you like to change?", "Change", [
      { id: IDS.change.car, title: "Car" },
      { id: IDS.change.dates, title: "Dates and times" },
      { id: IDS.change.pickup, title: "Pickup location" },
      { id: IDS.change.dropoff, title: "Drop-off location" },
      { id: IDS.change.name, title: "Name" },
    ]),
  confirmed: (n, url, hours) =>
    textReply(
      `✅ Your booking #${n} is confirmed.\n\nNext step: please upload a photo of your passport and your driving permit using this private link (valid for ${hours} hours):\n${url}\n\nPayment is in cash when you collect the car. Our team will review your documents and let you know.`,
    ),

  vehicleUnavailable: (car, alts) =>
    alts.length > 0
      ? listReply(
          `Sorry, the ${car} isn't available for those dates. These cars are free for the same dates:`,
          "See cars",
          carRows(alts),
        )
      : buttonsReply(
          `Sorry, the ${car} isn't available for those dates, and no other car is free then. Would you like to try different dates?`,
          [
            { id: IDS.change.dates, title: "Change dates" },
            { id: IDS.menu.talkHuman, title: "Talk to someone" },
          ],
        ),
  domainError: (code, ctx) => {
    const text: Partial<Record<typeof code, string>> = {
      INVALID_DATES:
        "Those dates don't work — the return must be after the pickup, and both must be in the future.",
      BELOW_MINIMUM_RENTAL: `The minimum rental is ${ctx?.minDays ?? 1} day${(ctx?.minDays ?? 1) === 1 ? "" : "s"}. Please choose a later return.`,
      OUTSIDE_OPENING_HOURS: `${ctx?.locationName ?? "That location"} is closed at the time you chose. Please pick a time within opening hours or another location.`,
      LOCATION_NOT_FOUND:
        "I couldn't use that location. Please choose one from the list.",
      VEHICLE_NOT_FOUND:
        "That car is no longer available. Please choose another one.",
    };
    return buttonsReply(
      text[code] ??
        "Sorry, I couldn't complete that step. You can go back or talk to someone on our team.",
      navButtons,
    );
  },

  noActiveBooking: () =>
    buttonsReply(
      "I couldn't find a confirmed booking on this number. Would you like to make a new one, or talk to someone?",
      [
        { id: IDS.menu.viewCars, title: "View cars" },
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
      ],
    ),
  chooseBooking: (bookings) =>
    listReply(
      "You have more than one booking. Which one do you mean?",
      "Bookings",
      bookings.map((b) => ({
        id: bookingPickId(b.id),
        title: `Booking #${b.bookingNumber}`,
        description: b.label,
      })),
    ),
  statusCard: (d) =>
    listReply(`${card(d)}\n\nHow can we help?`, "Options", [
      { id: IDS.req.delay, title: "Report a delay" },
      { id: IDS.req.extension, title: "Extend my rental" },
      { id: IDS.req.pickupChange, title: "Change pickup time" },
      { id: IDS.req.cancel, title: "Cancel booking" },
      { id: IDS.menu.talkHuman, title: "Talk to someone" },
    ]),
  awaitingDocuments: (d, url) =>
    buttonsReply(
      `${card(d)}${url && d.documentStatus === "NOT_SUBMITTED" ? `\n\nUpload your documents here:\n${url}` : ""}`,
      [
        { id: IDS.menu.existingBooking, title: "Booking options" },
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
      ],
    ),
  askChangeDetails: (type, ctx) => {
    const now = (v: string | null) => (v ? ` (currently ${dt(v)})` : "");
    const text: Record<ChangeKind, string> = {
      RETURN_DELAY: `How late will you be? Give the new return time${now(ctx.currentReturnAt)}, or a delay like _2 hours_.`,
      EXTENSION: `Until when would you like to keep the car${now(ctx.currentReturnAt)}? Give a new return date and time.`,
      PICKUP_TIME_CHANGE: `What new pickup date and time would you like${now(ctx.currentPickupAt)}?`,
      CANCELLATION:
        "I can send a cancellation request to our team. Please tell me briefly why, or tap Send request.",
    };
    return type === "CANCELLATION"
      ? buttonsReply(text[type], [
          { id: IDS.confirm.yes, title: "Send request" },
          { id: IDS.menu.main, title: "Main menu" },
        ])
      : textReply(text[type]);
  },
  changeNotUnderstood: (type) =>
    textReply(
      type === "RETURN_DELAY"
        ? "Sorry, I couldn't read that. Give a new return time (e.g. _today 6pm_) or a delay (e.g. _2 hours_)."
        : "Sorry, I couldn't read that date. Try something like _tomorrow 5pm_ or _20 Oct 10:00_.",
    ),
  changeConfirm: (c) =>
    buttonsReply(
      [
        `Please check your request for booking #${c.bookingNumber}:`,
        `*${CHANGE_LABEL[c.type][0].toUpperCase()}${CHANGE_LABEL[c.type].slice(1)}*`,
        c.newReturnAt ? `New return: ${dt(c.newReturnAt)}` : null,
        c.newPickupAt ? `New pickup: ${dt(c.newPickupAt)}` : null,
        c.note ? `Note: ${c.note}` : null,
        "",
        "I'll send this to our team. It isn't approved until they confirm.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
      [
        { id: IDS.confirm.yes, title: "Send request" },
        { id: IDS.confirm.change, title: "Change" },
        { id: IDS.confirm.cancel, title: "Never mind" },
      ],
    ),
  changeSent: (c, quote) =>
    buttonsReply(
      [
        `✅ Your ${CHANGE_LABEL[c.type]} request for booking #${c.bookingNumber} has been sent to our team.`,
        quote.additionalRs > 0
          ? `Estimated extra cost if approved: ${formatPriceRs(quote.additionalRs)}.`
          : null,
        !quote.availabilityOk
          ? "Note: the car may not be free for that time — the team will check."
          : null,
        "It is not approved yet; we'll message you here once the team has decided.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
      [
        { id: IDS.menu.existingBooking, title: "My booking" },
        { id: IDS.menu.main, title: "Main menu" },
      ],
    ),
  paymentClaim: () =>
    buttonsReply(
      "Thanks for letting us know. Payment is cash only, made when you collect the car, and I can't confirm a payment in this chat — our team records payments themselves. I've left a note for them, or you can talk to someone now.",
      [
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
        { id: IDS.menu.main, title: "Main menu" },
      ],
    ),

  faqAnswer: (a) =>
    buttonsReply(a, [
      { id: IDS.faq.helpful, title: "Helpful 👍" },
      { id: IDS.menu.talkHuman, title: "Talk to someone" },
    ]),
  faqInline: (a) => a,
  faqThanks: () =>
    buttonsReply("Glad that helped! Anything else?", [
      { id: IDS.menu.main, title: "Main menu" },
      { id: IDS.menu.talkHuman, title: "Talk to someone" },
    ]),
  faqNoAnswer: () =>
    buttonsReply(
      "Sorry about that. Would you like to talk to someone on our team?",
      [
        { id: IDS.menu.talkHuman, title: "Talk to someone" },
        { id: IDS.menu.main, title: "Main menu" },
      ],
    ),
  backToBooking: () => "Back to your booking:",
};
