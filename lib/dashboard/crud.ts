import "server-only";
import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { Permission } from "@/lib/domain/permissions";

/** Generic server-action helpers for the simple settings tables. */
export async function upsertRow(
  perm: Permission,
  table: string,
  path: string,
  values: Record<string, unknown>,
  id?: string | null,
) {
  const staff = await requireAction(perm);
  const db = getServiceSupabase();
  const { error } = id
    ? await db.from(table).update(values).eq("id", id)
    : await db.from(table).insert(values);
  if (error) throw new Error(error.message);
  await audit(
    staff,
    `${table}.${id ? "update" : "create"}`,
    table,
    id ?? undefined,
  );
  revalidatePath(path);
}

export async function deleteRow(
  perm: Permission,
  table: string,
  path: string,
  id: string,
) {
  const staff = await requireAction(perm);
  const { error } = await getServiceSupabase()
    .from(table)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  await audit(staff, `${table}.delete`, table, id);
  revalidatePath(path);
}
