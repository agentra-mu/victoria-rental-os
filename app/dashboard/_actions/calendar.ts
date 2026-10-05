"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { reassignBooking } from "@/lib/domain/reassign";
import { DomainError } from "@/lib/domain/errors";

export async function reassignFromCalendar(
  bookingId: string,
  vehicleId: string,
): Promise<{ error?: string }> {
  const staff = await requireAction("fleet");
  try {
    await reassignBooking(getServiceSupabase(), bookingId, vehicleId, staff.id);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
  await audit(staff, "booking.reassign", "booking", bookingId, {
    vehicleId,
    via: "calendar",
  });
  revalidatePath("/dashboard/calendar");
  return {};
}
