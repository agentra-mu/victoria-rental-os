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

const GREEN = "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
const AMBER = "bg-amber-50 text-amber-800 ring-amber-600/25";
const RED = "bg-red-50 text-red-700 ring-red-600/20";
const BLUE = "bg-sky-50 text-sky-700 ring-sky-600/20";
const BADGE: Record<string, string> = {
  PAID: GREEN,
  VERIFIED: GREEN,
  CONFIRMED: GREEN,
  COMPLETED: GREEN,
  UNPAID: AMBER,
  NEEDS_REVIEW: AMBER,
  PENDING_DOCUMENTS: AMBER,
  PENDING: AMBER,
  NEEDS_HUMAN: RED,
  REJECTED: RED,
  CANCELLED: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
  PICKED_UP: BLUE,
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[value] ?? "bg-zinc-50 text-zinc-600 ring-zinc-500/20"}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
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
    <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      {title && (
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-900">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export const btn =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 active:bg-zinc-100";
export const btnPrimary =
  "rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800 active:bg-teal-900";
export const input = "w-full rounded-lg border p-2 text-sm";

const TONE = {
  teal: "text-teal-700 bg-teal-50",
  sky: "text-sky-700 bg-sky-50",
  amber: "text-amber-700 bg-amber-50",
  violet: "text-violet-700 bg-violet-50",
  zinc: "text-zinc-700 bg-zinc-100",
} as const;

export function Stat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div
        className={`mt-2 inline-block min-w-10 rounded-lg px-2.5 py-0.5 text-2xl font-semibold tabular-nums ${TONE[tone]}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Mauritius-local date input value ("YYYY-MM-DD") for an instant. */
export function localDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Indian/Mauritius" });
}
