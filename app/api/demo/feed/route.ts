import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Read-only mini feed for the /demo side panel: latest bookings and open notifications. Demo-only. */
export async function GET() {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const db = getServiceSupabase();
  const [{ data: notifications }, { data: bookings }] = await Promise.all([
    db
      .from("owner_notifications")
      .select("id, type, title, created_at, booking_id")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("bookings")
      .select(
        "id, booking_number, status, payment_status, total_rs, created_at, customers(full_name, whatsapp_number), vehicles(make, model)",
      )
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  return NextResponse.json({
    ok: true,
    data: { notifications: notifications ?? [], bookings: bookings ?? [] },
  });
}
