import Link from "next/link";
import { requireStaff } from "@/lib/dashboard/auth";
import { Card } from "../../_components/ui";

export default async function Settings() {
  await requireStaff("settings");
  const links = [
    [
      "/dashboard/settings/knowledge",
      "Knowledge base (what the AI answers from)",
    ],
    ["/dashboard/settings/locations", "Locations, opening hours & fees"],
    ["/dashboard/settings/snippets", "Quick replies & message templates"],
    ["/dashboard/settings/staff", "Staff & permissions"],
    ["/dashboard/settings/audit", "Audit log"],
  ];
  return (
    <Card title="Settings">
      <ul className="flex flex-col gap-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link className="underline" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
