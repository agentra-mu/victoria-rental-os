import "server-only";
import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { invalidateBotCaches } from "@/lib/bot/cache";
import type { Permission } from "@/lib/domain/permissions";

/** Tables the bot caches for a minute — an edit takes effect immediately on this instance. */
const BOT_CACHED_TABLES = new Set([
  "knowledge_base",
  "locations",
  "vehicles",
  "vehicle_categories",
]);

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
  if (BOT_CACHED_TABLES.has(table)) invalidateBotCaches();
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
  if (BOT_CACHED_TABLES.has(table)) invalidateBotCaches();
  revalidatePath(path);
}
