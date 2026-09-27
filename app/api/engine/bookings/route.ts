import { z } from "zod";
import { createBookingDraft } from "@/lib/domain/createBookingDraft";
import {
  checkInternalSecret,
  getEngineDb,
  jsonError,
  jsonOk,
  readJsonBody,
} from "../_shared";

const bodySchema = z.object({
  customerId: z.string().uuid(),
});

export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const { customerId } = bodySchema.parse(await readJsonBody(request));
    const booking = await createBookingDraft(getEngineDb(), customerId);
    return jsonOk({ booking }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
