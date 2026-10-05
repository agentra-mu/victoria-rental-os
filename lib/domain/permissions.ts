export type StaffRole = "OWNER" | "STAFF";

export const PERMISSIONS = [
  "bookings",
  "inbox",
  "takeover",
  "mark_paid",
  "approve_requests",
  "view_documents",
  "fleet",
  // OWNER-only by default:
  "undo_payment",
  "reject_documents",
  "staff_management",
  "analytics",
  "settings",
  "audit_log",
  "data_export",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_DEFAULTS: ReadonlySet<Permission> = new Set([
  "bookings",
  "inbox",
  "takeover",
  "mark_paid",
  "approve_requests",
  "view_documents",
  "fleet",
]);

export interface StaffIdentity {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  /** Per-user overrides for STAFF, e.g. { mark_paid: false }. Ignored for OWNER. */
  permissions?: Partial<Record<Permission, boolean>> | null;
}

export function can(staff: StaffIdentity, permission: Permission): boolean {
  if (!staff.active) return false;
  if (staff.role === "OWNER") return true;
  const override = staff.permissions?.[permission];
  if (override !== undefined) {
    // Owner-only permissions can't be granted to STAFF by an override.
    return STAFF_DEFAULTS.has(permission) ? override : false;
  }
  return STAFF_DEFAULTS.has(permission);
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`Not allowed: ${permission}`);
    this.name = "PermissionError";
  }
}

export function assertCan(staff: StaffIdentity, permission: Permission): void {
  if (!can(staff, permission)) throw new PermissionError(permission);
}
