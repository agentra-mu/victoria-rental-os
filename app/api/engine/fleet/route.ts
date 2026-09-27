import { NextRequest } from "next/server";
import { z } from "zod";
import { getFleet } from "@/lib/domain/getFleet";
import {
  checkInternalSecret,
  getEngineDb,
  isoDateTime,
  jsonError,
  jsonOk,
} from "../_shared";

const querySchema = z.object({
  pickupAt: isoDateTime.optional(),
  returnAt: isoDateTime.optional(),
});

export async function GET(request: NextRequest) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const params = request.nextUrl.searchParams;
    const { pickupAt, returnAt } = querySchema.parse({
      pickupAt: params.get("pickupAt") ?? undefined,
      returnAt: params.get("returnAt") ?? undefined,
    });
    const groups = await getFleet(getEngineDb(), { pickupAt, returnAt });
    return jsonOk({ groups });
  } catch (error) {
    return jsonError(error);
  }
}
