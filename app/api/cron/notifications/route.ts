import { checkInternalSecret, jsonError, jsonOk } from "@/lib/api/http";
import { runScheduled } from "@/lib/notifications/runScheduled";
import { log } from "@/lib/monitoring/log";

export const maxDuration = 60;

/**
 * Sends every due reminder and runs periodic jobs. Protected by
 * x-internal-secret OR Vercel Cron's "Authorization: Bearer $CRON_SECRET".
 */
async function handle(request: Request) {
  const bearer = request.headers.get("authorization");
  const vercelOk =
    !!process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`;
  if (!vercelOk) {
    const authError = checkInternalSecret(request);
    if (authError) return authError;
  }
  try {
    const result = await runScheduled();
    log.info("cron.notifications", result);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export const GET = handle;
export const POST = handle;
