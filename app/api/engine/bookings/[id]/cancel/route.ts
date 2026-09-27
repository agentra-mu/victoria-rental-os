import { z } from "zod";
import { cancelBooking } from "@/lib/domain/cancelBooking";
import {
  checkInternalSecret,
  getEngineDb,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../../../_shared";

const bodySchema = z.object({
  actor: z.enum(["ai", "owner", "customer", "system"]),
  reason: z.string().min(1),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/engine/bookings/[id]/cancel">,
) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const { actor, reason } = bodySchema.parse(await readJsonBody(request));
    const booking = await cancelBooking(getEngineDb(), id, actor, reason);
    return jsonOk({ booking });
  } catch (error) {
    return jsonError(error);
  }
}
