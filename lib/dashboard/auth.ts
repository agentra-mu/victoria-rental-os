import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  can,
  PermissionError,
  type Permission,
  type StaffIdentity,
} from "@/lib/domain/permissions";

export async function getAuthClient() {
  const store = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — the proxy refreshes the cookie instead.
          }
        },
      },
    },
  );
}

/** The signed-in, active staff user — or null (anyone not in staff_users is treated as signed out). */
export async function getStaff(): Promise<StaffIdentity | null> {
  const auth = await getAuthClient();
  const { data } = await auth.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await getServiceSupabase()
    .from("staff_users")
    .select("id, name, role, active, permissions")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!row || !row.active) return null;
  return row as StaffIdentity;
}

/** Page guard: redirects to login unless signed in (and, optionally, permitted). */
export async function requireStaff(
  permission?: Permission,
): Promise<StaffIdentity> {
  const staff = await getStaff();
  if (!staff) redirect("/dashboard/login");
  if (permission && !can(staff, permission)) redirect("/dashboard?denied=1");
  return staff;
}

/** Server-action guard: throws instead of redirecting. */
export async function requireAction(
  permission: Permission,
): Promise<StaffIdentity> {
  const staff = await getStaff();
  if (!staff) throw new PermissionError(permission);
  if (!can(staff, permission)) throw new PermissionError(permission);
  return staff;
}

export async function audit(
  staff: StaffIdentity,
  action: string,
  entity?: string,
  entityId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await getServiceSupabase()
    .from("audit_log")
    .insert({
      staff_user_id: staff.id,
      action,
      entity: entity ?? null,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
}
