import type { ReactNode } from "react";

export const fmtDateTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        timeZone: "Indian/Mauritius",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

export const fmtDate = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", {
        timeZone: "Indian/Mauritius",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const BADGE: Record<string, string> = {
  PAID: "bg-green-100 text-green-800",
  VERIFIED: "bg-green-100 text-green-800",
  CONFIRMED: "bg-green-100 text-green-800",
  COMPLETED: "bg-green-100 text-green-800",
  UNPAID: "bg-amber-100 text-amber-800",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  PENDING_DOCUMENTS: "bg-amber-100 text-amber-800",
  PENDING: "bg-amber-100 text-amber-800",
  NEEDS_HUMAN: "bg-red-100 text-red-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-zinc-200 text-zinc-700",
  PICKED_UP: "bg-blue-100 text-blue-800",
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[value] ?? "bg-zinc-100 text-zinc-700"}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-4 rounded-lg border bg-white p-4">
      {title && <h2 className="mb-2 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export const btn =
  "rounded border bg-white px-3 py-2 text-sm hover:bg-zinc-50 active:bg-zinc-100";
export const btnPrimary =
  "rounded bg-black px-3 py-2 text-sm text-white hover:bg-zinc-800";
export const input = "w-full rounded border p-2 text-sm";

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

/** Mauritius-local date input value ("YYYY-MM-DD") for an instant. */
export function localDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Indian/Mauritius" });
}
