/**
 * Static agent configuration. Company branding is a plain constant for now,
 * like the TBD business rules in /lib/domain/config.ts — move it to a
 * DB-backed settings table if/when the owner dashboard (Component 10) needs
 * to edit it without a deploy.
 */
export const COMPANY_NAME = "Victoria Car Rental";

export const DEFAULT_MODEL = "claude-sonnet-5";

/** Ceiling on the tool-call loop per customer turn — beyond this we escalate rather than loop forever. */
export const MAX_TOOL_ITERATIONS = 8;

export const MAX_RESPONSE_TOKENS = 1024;

/** How many past messages (both directions) are replayed into the model's context each turn. */
export const HISTORY_MESSAGE_LIMIT = 20;
