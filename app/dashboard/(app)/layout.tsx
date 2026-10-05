import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthClient, requireStaff } from "@/lib/dashboard/auth";
import { can, type Permission } from "@/lib/domain/permissions";

const NAV: { href: string; label: string; perm?: Permission }[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/bookings", label: "Bookings", perm: "bookings" },
  { href: "/dashboard/inbox", label: "Inbox", perm: "inbox" },
  { href: "/dashboard/calendar", label: "Calendar", perm: "bookings" },
  { href: "/dashboard/customers", label: "Customers", perm: "bookings" },
  { href: "/dashboard/fleet", label: "Fleet", perm: "fleet" },
  { href: "/dashboard/analytics", label: "Analytics", perm: "analytics" },
  { href: "/dashboard/settings", label: "Settings", perm: "settings" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();
  async function signOut() {
    "use server";
    await (await getAuthClient()).auth.signOut();
    redirect("/dashboard/login");
  }
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto p-2 text-sm">
          {NAV.filter((n) => !n.perm || can(staff, n.perm)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-3 py-2 whitespace-nowrap hover:bg-zinc-100"
            >
              {n.label}
            </Link>
          ))}
          <form action={signOut} className="ml-auto">
            <button className="rounded px-3 py-2 whitespace-nowrap text-zinc-500 hover:bg-zinc-100">
              {staff.name} · Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl p-4">{children}</div>
    </div>
  );
}
