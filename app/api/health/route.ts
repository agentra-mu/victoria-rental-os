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

/** Liveness + dependency check: database, WhatsApp token validity, Anthropic API reachability. */
export async function GET() {
  const [database, whatsapp, anthropic] = await Promise.all([
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
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    }),
  ]);
  const ok = database.ok && whatsapp.ok && anthropic.ok;
  return NextResponse.json(
    { ok, database, whatsapp, anthropic },
    { status: ok ? 200 : 503 },
  );
}
