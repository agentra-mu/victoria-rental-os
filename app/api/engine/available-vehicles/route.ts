import { z } from "zod";
import { getAvailableVehicles } from "@/lib/domain/getAvailableVehicles";
import {
  checkInternalSecret,
  getEngineDb,
  isoDateTime,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_shared";

const bodySchema = z.object({
  pickupAt: isoDateTime,
  returnAt: isoDateTime,
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const groups = await getAvailableVehicles(getEngineDb(), body);
    return jsonOk({ groups });
  } catch (error) {
    return jsonError(error);
  }
}
