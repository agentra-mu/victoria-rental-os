import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function check(
  fn: () => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000),
      ),
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Liveness + dependency check: database and WhatsApp token validity; the optional LLM is reported but never fails the check. */
export async function GET() {
  const [database, whatsapp, llm] = await Promise.all([
    check(async () => {
      const { error } = await getServiceSupabase()
        .from("knowledge_base")
        .select("id", { head: true, count: "exact" });
      if (error) throw new Error(error.message);
    }),
    check(async () => {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
        { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } },
      );
      if (!res.ok)
        throw new Error(`Graph API ${res.status} — token invalid or expired`);
    }),
    check(async () => {
      // Optional: with LLM_ENABLED unset/false there is nothing to check.
      if (process.env.LLM_ENABLED !== "true" || !process.env.LLM_BASE_URL)
        return;
      const res = await fetch(
        `${process.env.LLM_BASE_URL.replace(/\/+$/, "")}/models`,
        {
          headers: process.env.LLM_API_KEY
            ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
            : {},
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!res.ok) throw new Error(`LLM endpoint ${res.status}`);
    }),
  ]);
  const ok = database.ok && whatsapp.ok; // the LLM is optional
  return NextResponse.json(
    { ok, database, whatsapp, llm },
    { status: ok ? 200 : 503 },
  );
}
