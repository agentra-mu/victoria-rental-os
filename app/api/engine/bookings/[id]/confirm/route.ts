import { confirmBooking } from "@/lib/domain/confirmBooking";
import {
  checkInternalSecret,
  getEngineDb,
  jsonError,
  jsonOk,
} from "../../../_shared";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/engine/bookings/[id]/confirm">,
) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const booking = await confirmBooking(getEngineDb(), id);
    return jsonOk({ booking });
  } catch (error) {
    return jsonError(error);
  }
}
