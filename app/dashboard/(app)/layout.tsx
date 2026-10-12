import Link from "next/link";
import NavLinks from "../_components/NavLinks";
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2.5">
          <Link
            href="/dashboard"
            className="mr-3 flex items-center gap-2 whitespace-nowrap"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm font-bold text-white">
              V
            </span>
            <span className="hidden font-semibold tracking-tight text-zinc-900 sm:inline">
              Victoria Car Rental
            </span>
          </Link>
          {process.env.DEMO_MODE === "true" && (
            <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tracking-wider whitespace-nowrap text-amber-800">
              DEMO
            </span>
          )}
          <NavLinks items={NAV.filter((n) => !n.perm || can(staff, n.perm))} />
          <form action={signOut} className="ml-auto pl-2">
            <button className="rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
              <span className="font-medium text-zinc-700">{staff.name}</span> ·
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
