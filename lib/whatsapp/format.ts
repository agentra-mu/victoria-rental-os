import { TIMEZONE } from "@/lib/domain/config";
import type { PriceLineItem } from "@/lib/domain/calculatePrice";
import type { FleetGroup } from "@/lib/domain/getFleet";

const LIST_MAX_ROWS = 10;
const LIST_ROW_TITLE_MAX = 24;
const LIST_ROW_DESCRIPTION_MAX = 72;
const LIST_BUTTON_TEXT_MAX = 20;
const REPLY_BUTTONS_MAX = 3;
const REPLY_BUTTON_TITLE_MAX = 20;

/** Cuts to `maxLength`, replacing the last character with an ellipsis if anything was cut. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

/** "Rs 7,500" — Mauritian Rupees, no decimals (CLAUDE.md: currency is whole Rs). */
export function formatPriceRs(amountRs: number): string {
  return `Rs ${Math.round(amountRs).toLocaleString("en-US")}`;
}

/** Renders a UTC instant in Indian/Mauritius local time (CLAUDE.md: store UTC, display local). */
export function formatMauritiusDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/** Plain WhatsApp text listing available fleet groups, for when an interactive list isn't used. */
export function formatFleetListText(groups: FleetGroup[]): string {
  if (groups.length === 0) {
    return "Sorry, we don't have any vehicles available for those dates right now.";
  }

  const entries = groups.map((group) => {
    const availability =
      group.available !== undefined ? ` — ${group.available} available` : "";
    const details = [
      group.transmission,
      group.seats ? `${group.seats} seats` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return [
      `*${group.make} ${group.model}*${availability}`,
      `${formatPriceRs(group.dailyPriceRs)}/day${details ? ` · ${details}` : ""}`,
    ].join("\n");
  });

  return `*Our fleet* 🚗\n\n${entries.join("\n\n")}`;
}

export interface BookingSummaryInput {
  vehicleMake: string;
  vehicleModel: string;
  pickupAt: Date | string;
  returnAt: Date | string;
  pickupLocationName: string;
  dropoffLocationName?: string;
  rentalDays: number;
  lineItems: PriceLineItem[];
  totalRs: number;
}

/** WhatsApp-friendly booking confirmation text: bold labels, line breaks, sparing emoji. */
export function formatBookingSummaryText(summary: BookingSummaryInput): string {
  const lines = [
    "*Booking summary*",
    `🚗 ${summary.vehicleMake} ${summary.vehicleModel}`,
    `📅 ${formatMauritiusDateTime(summary.pickupAt)} → ${formatMauritiusDateTime(summary.returnAt)} (${summary.rentalDays} day${summary.rentalDays === 1 ? "" : "s"})`,
    `📍 Pickup: ${summary.pickupLocationName}`,
  ];

  if (
    summary.dropoffLocationName &&
    summary.dropoffLocationName !== summary.pickupLocationName
  ) {
    lines.push(`📍 Drop-off: ${summary.dropoffLocationName}`);
  }

  lines.push("", "*Price*");
  for (const item of summary.lineItems) {
    lines.push(`${item.label}: ${formatPriceRs(item.amountRs)}`);
  }
  lines.push(`*Total: ${formatPriceRs(summary.totalRs)}*`);

  return lines.join("\n");
}

export interface WhatsAppListRowInput {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListMessage {
  type: "list";
  body: { text: string };
  action: {
    button: string;
    sections: [{ rows: { id: string; title: string; description?: string }[] }];
  };
}

/** Interactive list message payload (max 10 rows, row title max 24 chars) — truncates rather than throwing. */
export function buildListMessage(args: {
  bodyText: string;
  buttonText: string;
  rows: WhatsAppListRowInput[];
}): WhatsAppListMessage {
  const rows = args.rows.slice(0, LIST_MAX_ROWS).map((row) => ({
    id: row.id,
    title: truncate(row.title, LIST_ROW_TITLE_MAX),
    ...(row.description
      ? { description: truncate(row.description, LIST_ROW_DESCRIPTION_MAX) }
      : {}),
  }));

  return {
    type: "list",
    body: { text: args.bodyText },
    action: {
      button: truncate(args.buttonText, LIST_BUTTON_TEXT_MAX),
      sections: [{ rows }],
    },
  };
}

export interface WhatsAppButtonInput {
  id: string;
  title: string;
}

export interface WhatsAppButtonsMessage {
  type: "button";
  body: { text: string };
  action: {
    buttons: { type: "reply"; reply: { id: string; title: string } }[];
  };
}

/** Reply-button message payload (max 3 buttons, title max 20 chars) — truncates rather than throwing. */
export function buildReplyButtonsMessage(args: {
  bodyText: string;
  buttons: WhatsAppButtonInput[];
}): WhatsAppButtonsMessage {
  const buttons = args.buttons.slice(0, REPLY_BUTTONS_MAX).map((button) => ({
    type: "reply" as const,
    reply: {
      id: button.id,
      title: truncate(button.title, REPLY_BUTTON_TITLE_MAX),
    },
  }));

  return {
    type: "button",
    body: { text: args.bodyText },
    action: { buttons },
  };
}
