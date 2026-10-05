import { NextResponse } from "next/server";
import { audit, getStaff } from "@/lib/dashboard/auth";
import { can } from "@/lib/domain/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Opens an identity document via a 60-second signed URL. Every view is audit-logged. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaff();
  if (!staff || !can(staff, "view_documents")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const db = getServiceSupabase();
  const { data: doc } = await db
    .from("documents")
    .select("id, booking_id, doc_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const { data } = await db.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60);
  if (!data) return new NextResponse("Unavailable", { status: 502 });
  await audit(staff, "document.view", "document", doc.id, {
    bookingId: doc.booking_id,
    docType: doc.doc_type,
  });
  return NextResponse.redirect(data.signedUrl);
}
