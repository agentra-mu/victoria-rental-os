/**
 * Demo personas (documented in docs/DEMO.md). Plain constants so the seed
 * script (run by plain Node) and the app share one definition.
 */
export const PERSONAS = {
  /** No customer row until they message; booking history is wiped on "Reset conversation". */
  newCustomer: "+23057000001",
  /** Priya Doorgakant: Vitz rental in progress, due back tomorrow. */
  existingCustomer: "+23057000002",
} as const;

/** Free-text numbers the presenter may use in the /demo chat. They hold only demo-created data. */
export const CUSTOM_NUMBER_PATTERN = /^\+2305799\d{5}$/;

export function isDemoChatNumber(value: string): boolean {
  return (
    value === PERSONAS.newCustomer ||
    value === PERSONAS.existingCustomer ||
    CUSTOM_NUMBER_PATTERN.test(value)
  );
}

/** Numbers whose customer record (bookings included) is deleted by "Reset conversation". */
export function isDisposableDemoNumber(value: string): boolean {
  return value === PERSONAS.newCustomer || CUSTOM_NUMBER_PATTERN.test(value);
}
