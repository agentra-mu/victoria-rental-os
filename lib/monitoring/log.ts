/** Structured (JSON-line) logging — Vercel/log drains parse these. */
type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...data,
  });
  (level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.log)(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) =>
    emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) =>
    emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) =>
    emit("error", event, data),
};

/**
 * Error alerting: logs, then (if ALERT_WEBHOOK_URL is set — e.g. a Slack/Make/
 * Zapier hook that emails the admin) posts a short message. Never throws.
 */
export async function alertError(event: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  log.error(event, { message });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🚨 Victoria Car Rental — ${event}: ${message}`,
      }),
    });
  } catch {
    // alerting must never take the request down
  }
}
