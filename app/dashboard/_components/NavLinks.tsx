"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const path = usePathname();
  return (
    <>
      {items.map((n) => {
        const active =
          n.href === "/dashboard"
            ? path === n.href
            : path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              active
                ? "bg-teal-50 text-teal-800"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
