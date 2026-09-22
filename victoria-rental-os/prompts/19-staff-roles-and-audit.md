# Component 19 — Staff roles and audit

**What it is:** Owner and staff accounts with different permissions, enforced in both the
database and the app, with a searchable audit log.

---

## Testing, launch and build order

## Prompt

```text
Read CLAUDE.md. Add role-based access control.
Roles: OWNER (everything, including undo payments, reject documents, staff management, analytics, settings, data export/deletion) and STAFF (bookings, inbox, takeover, mark paid, approve requests, view documents — configurable per staff user). Enforce in RLS policies AND server actions (defence in depth), hide unauthorised UI. Owner can invite staff by email, deactivate them, and view the audit log with filters (user, action, date). Tests that attempt each privileged action as STAFF and assert denial.
```
