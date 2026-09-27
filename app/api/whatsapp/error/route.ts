import { z } from "zod";
import { checkInternalSecret, jsonOk, readJsonBody } from "@/lib/api/http";

const bodySchema = z.object({
  from: z.string().optional(),
  messageId: z.string().optional(),
  step: z.string().optional(),
  error: z.string(),
});

/**
 * The n8n inbound workflow's error branch posts here when
 * /api/whatsapp/inbound (or a downstream send) fails, after it has already
 * sent the customer a fallback message. There's no dedicated error-log table
 * yet (see CLAUDE.md open questions) — this just gets it into the server
 * logs so it's not silently lost; add persistence here if that's not enough.
 */
export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  const body = bodySchema.safeParse(await readJsonBody(request));
  console.error(
    "[whatsapp:error]",
    body.success ? body.data : { raw: "unparseable error payload" },
  );
  return jsonOk({ logged: true });
}
