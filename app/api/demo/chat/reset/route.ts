import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/http";
import { isDemoMode } from "@/lib/demo/mode";
import { isDemoChatNumber } from "@/lib/demo/personas";
import { resetDemoConversation } from "@/lib/demo/reset";
import { getServiceSupabase } from "@/lib/supabase/server";

/** "Reset conversation" button in /demo. Demo-only, limited to demo chat numbers. */
export async function POST(request: Request) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const parsed = z
    .object({ whatsapp_number: z.string() })
    .safeParse(await readJsonBody(request));
  if (!parsed.success || !isDemoChatNumber(parsed.data.whatsapp_number)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_A_DEMO_NUMBER", message: "Not a demo number" },
      },
      { status: 403 },
    );
  }
  try {
    const result = await resetDemoConversation(
      getServiceSupabase(),
      parsed.data.whatsapp_number,
    );
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Reset failed" } },
      { status: 500 },
    );
  }
}
