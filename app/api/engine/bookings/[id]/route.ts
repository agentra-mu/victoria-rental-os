import { z } from "zod";
import { updateBookingDraft } from "@/lib/domain/updateBookingDraft";
import {
  checkInternalSecret,
  getEngineDb,
  isoDateTime,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../../_shared";

const bodySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  pickupAt: isoDateTime.optional(),
  returnAt: isoDateTime.optional(),
  pickupLocationId: z.string().uuid().optional(),
  dropoffLocationId: z.string().uuid().optional(),
});

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/engine/bookings/[id]">,
) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const fields = bodySchema.parse(await readJsonBody(request));
    const booking = await updateBookingDraft(getEngineDb(), id, fields);
    return jsonOk({ booking });
  } catch (error) {
    return jsonError(error);
  }
}
