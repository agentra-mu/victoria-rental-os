export type Priority = "red" | "amber" | "green";

const AMBER_TYPES = new Set([
  "DELAY",
  "PICKUP_CHANGE",
  "EXTENSION_REQUEST",
  "CASH_ISSUE",
  "CHANGE_REQUEST",
]);

/**
 * red = NEEDS_HUMAN / document review failed / complaint;
 * amber = open request (delay, pickup change, extension, cash issue);
 * green = AI handling normally.
 */
export function conversationPriority(input: {
  mode: string;
  bookingStatus?: string | null;
  documentStatus?: string | null;
  openNotificationTypes: string[];
}): Priority {
  const types = new Set(input.openNotificationTypes);
  if (
    types.has("NEEDS_HUMAN") ||
    input.bookingStatus === "NEEDS_HUMAN" ||
    input.documentStatus === "REJECTED"
  ) {
    return "red";
  }
  if ([...types].some((t) => AMBER_TYPES.has(t))) return "amber";
  return "green";
}
