"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reassignFromCalendar } from "../_actions/calendar";

export interface CalBar {
  id: string;
  bookingNumber?: number;
  status?: string;
  label: string;
  start: number;
  end: number;
  kind: "booking" | "maintenance";
}
export interface CalRow {
  vehicleId: string;
  name: string;
  utilisation: number;
  bars: CalBar[];
}

const COLOR: Record<string, string> = {
  PENDING_DOCUMENTS: "bg-amber-400",
  DOCUMENTS_VERIFIED: "bg-lime-400",
  CONFIRMED: "bg-green-500 text-white",
  PICKED_UP: "bg-blue-500 text-white",
  RETURNED: "bg-zinc-400 text-white",
  COMPLETED: "bg-zinc-300",
  NEEDS_HUMAN: "bg-red-500 text-white",
  DATES_SELECTED: "bg-sky-200",
  CAR_SELECTED: "bg-sky-200",
};

export default function CalendarGrid({
  days,
  todayIndex,
  rows,
}: {
  days: { key: string; label: string }[];
  todayIndex: number;
  rows: CalRow[];
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const cols = `150px repeat(${days.length}, minmax(26px, 1fr))`;

  const drop = (vehicleId: string, row: CalRow) => {
    if (!dragging) return;
    const bar = rows.flatMap((r) => r.bars).find((b) => b.id === dragging);
    setDragging(null);
    if (!bar || row.bars.some((b) => b.id === bar.id)) return;
    if (
      !confirm(
        `Move booking #${bar.bookingNumber} to ${row.name}? The engine will refuse if there's a conflict.`,
      )
    )
      return;
    start(async () => {
      setError(null);
      const res = await reassignFromCalendar(bar.id, vehicleId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      {error && <p className="bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="min-w-[640px]">
        <div
          className="grid border-b text-[10px] text-zinc-500"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="p-1">Vehicle · util.</div>
          {days.map((d, i) => (
            <div
              key={d.key}
              className={`p-1 text-center ${i === todayIndex ? "bg-yellow-100 font-bold text-black" : ""}`}
            >
              {d.label}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.vehicleId}
            className="relative grid items-center border-b text-xs"
            style={{ gridTemplateColumns: cols, gridAutoRows: "30px" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(row.vehicleId, row)}
          >
            <div className="truncate p-1" style={{ gridColumn: 1, gridRow: 1 }}>
              {row.name}{" "}
              <span className="text-zinc-400">
                {Math.round(row.utilisation * 100)}%
              </span>
            </div>
            {days.map((d, i) => (
              <div
                key={d.key}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                className={`h-full border-l ${i === todayIndex ? "bg-yellow-50" : ""}`}
              />
            ))}
            {row.bars.map((b) =>
              b.kind === "maintenance" ? (
                <div
                  key={b.id}
                  title={b.label}
                  className="z-[1] mx-px truncate rounded px-1 text-[10px] text-zinc-700"
                  style={{
                    gridColumn: `${b.start + 1} / ${b.end + 1}`,
                    gridRow: 1,
                    background:
                      "repeating-linear-gradient(45deg,#d4d4d8,#d4d4d8 4px,#f4f4f5 4px,#f4f4f5 8px)",
                  }}
                >
                  {b.label}
                </div>
              ) : (
                <Link
                  key={b.id}
                  href={`/dashboard/bookings/${b.id}`}
                  draggable
                  onDragStart={() => setDragging(b.id)}
                  title={b.label}
                  className={`z-[1] mx-px truncate rounded px-1 py-1 text-[11px] ${COLOR[b.status ?? ""] ?? "bg-zinc-200"}`}
                  style={{
                    gridColumn: `${b.start + 1} / ${b.end + 1}`,
                    gridRow: 1,
                  }}
                >
                  #{b.bookingNumber} {b.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
