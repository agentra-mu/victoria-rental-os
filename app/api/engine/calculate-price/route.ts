import { z } from "zod";
import { calculatePrice } from "@/lib/domain/calculatePrice";
import {
  checkInternalSecret,
  getEngineDb,
  isoDateTime,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_shared";

const bodySchema = z.object({
  vehicleId: z.string().uuid(),
  pickupAt: isoDateTime,
  returnAt: isoDateTime,
  pickupLocationId: z.string().uuid(),
  dropoffLocationId: z.string().uuid().optional(),
  extrasRs: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const price = await calculatePrice(getEngineDb(), body);
    return jsonOk(price);
  } catch (error) {
    return jsonError(error);
  }
}
