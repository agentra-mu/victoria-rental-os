import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/api/http";

export const isDemoMode = () => process.env.DEMO_MODE === "true";

/**
 * Guard shared by every /api/demo route: 404 unless DEMO_MODE=true, then the
 * usual x-internal-secret check. Returns a response to send, or null if OK.
 */
export function guardDemoRoute(request: Request): NextResponse | null {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  return checkInternalSecret(request);
}
