import type { DomainErrorCode } from "@/lib/domain/errors";
import type { PriceLineItem } from "@/lib/domain/calculatePrice";
import type { LocationRow } from "@/lib/domain/ports";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type { CarOption } from "../parsers/car";
import type { NameFailure } from "../parsers/name";
import type { ChangeKind } from "../types";

export interface SummaryData {
  carName: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  dropoffLocation: string;
  rentalDays: number;
  lineItems: PriceLineItem[];
  totalRs: number;
  customerName: string;
}

export interface StatusCardData {
  bookingNumber: number;
  status: string;
  carName: string | null;
  pickupAt: string | null;
  returnAt: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  totalRs: number | null;
  paymentStatus: string;
  documentStatus: string;
}

export interface ChangeSummary {
  type: ChangeKind;
  bookingNumber: number;
  newReturnAt?: string;
  newPickupAt?: string;
  note?: string;
}

/**
 * Every customer-facing string the bot can send. Both languages implement
 * this interface, so a missing French string is a type error. The only
 * non-template text the bot ever sends is a grounded knowledge-base answer.
 */
export interface Templates {
  menu(): WhatsAppReply;
  unknown(): WhatsAppReply;
  stuck(): WhatsAppReply;
  humanHandoff(): WhatsAppReply;
  humanAlreadyNotified(): WhatsAppReply;
  optedOut(): WhatsAppReply;
  optedIn(): WhatsAppReply;
  draftCancelled(): WhatsAppReply;
  nothingToCancel(): WhatsAppReply;
  mediaNotAccepted(uploadUrl: string | null): WhatsAppReply;
  genericError(): WhatsAppReply;

  carList(cars: CarOption[], mode: "fleet" | "available"): WhatsAppReply;
  carNotUnderstood(cars: CarOption[]): WhatsAppReply;
  carAmbiguous(cars: CarOption[]): WhatsAppReply;
  carSelected(car: CarOption): string;

  askPickupDateTime(): WhatsAppReply;
  askReturnDateTime(pickupLabel: string): WhatsAppReply;
  askTime(dateLabel: string): WhatsAppReply;
  askMeridiem(timeOptions: string[]): WhatsAppReply;
  askWhichDate(options: { iso: string; label: string }[]): WhatsAppReply;
  dateNotUnderstood(): WhatsAppReply;
  datePast(): WhatsAppReply;
  returnBeforePickup(): WhatsAppReply;
  noAvailabilityForDates(): WhatsAppReply;

  askPickupLocation(locations: LocationRow[]): WhatsAppReply;
  askDropoffLocation(
    locations: LocationRow[],
    pickupName: string,
  ): WhatsAppReply;
  locationNotUnderstood(locations: LocationRow[]): WhatsAppReply;
  locationAmbiguous(locations: LocationRow[]): WhatsAppReply;

  askName(existingName: string | null): WhatsAppReply;
  nameInvalid(reason: NameFailure): WhatsAppReply;

  summary(data: SummaryData): WhatsAppReply;
  changeMenu(): WhatsAppReply;
  confirmed(
    bookingNumber: number,
    uploadUrl: string,
    validHours: number,
  ): WhatsAppReply;

  vehicleUnavailable(carName: string, alternatives: CarOption[]): WhatsAppReply;
  domainError(
    code: DomainErrorCode,
    ctx?: { locationName?: string; minDays?: number },
  ): WhatsAppReply;

  noActiveBooking(): WhatsAppReply;
  chooseBooking(
    bookings: { id: string; bookingNumber: number; label: string }[],
  ): WhatsAppReply;
  statusCard(data: StatusCardData): WhatsAppReply;
  awaitingDocuments(
    data: StatusCardData,
    uploadUrl: string | null,
  ): WhatsAppReply;
  askChangeDetails(
    type: ChangeKind,
    ctx: { currentReturnAt: string | null; currentPickupAt: string | null },
  ): WhatsAppReply;
  changeNotUnderstood(type: ChangeKind): WhatsAppReply;
  changeConfirm(change: ChangeSummary): WhatsAppReply;
  changeSent(
    change: ChangeSummary,
    quote: { additionalRs: number; availabilityOk: boolean },
  ): WhatsAppReply;
  paymentClaim(): WhatsAppReply;

  faqAnswer(answer: string): WhatsAppReply;
  faqInline(answer: string): string;
  faqThanks(): WhatsAppReply;
  faqNoAnswer(): WhatsAppReply;
  backToBooking(): string;
}
