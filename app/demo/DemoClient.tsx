"use client";

import "@n8n/chat/style.css";
import { useCallback, useEffect, useRef, useState } from "react";

type PersonaKey = "new" | "existing" | "custom";

interface FeedData {
  notifications: {
    id: string;
    type: string;
    title: string;
    created_at: string;
  }[];
  bookings: {
    id: string;
    booking_number: number;
    status: string;
    payment_status: string;
    total_rs: number | null;
    created_at: string;
    customers: { full_name: string | null; whatsapp_number: string } | null;
    vehicles: { make: string; model: string } | null;
  }[];
}

interface TeamMessage {
  id: string;
  sender: string;
  body: string;
  created_at: string;
}

const CUSTOM_PATTERN = /^\+2305799\d{5}$/;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export default function DemoClient({
  chatUrl,
  personas,
}: {
  chatUrl: string;
  personas: { newCustomer: string; existingCustomer: string };
}) {
  const [persona, setPersona] = useState<PersonaKey>("new");
  const [custom, setCustom] = useState("+23057990001");
  const [nonce, setNonce] = useState(() => Date.now().toString(36));
  const [busy, setBusy] = useState(false);

  const number =
    persona === "new"
      ? personas.newCustomer
      : persona === "existing"
        ? personas.existingCustomer
        : CUSTOM_PATTERN.test(custom)
          ? custom
          : "";

  // --- the n8n chat widget -------------------------------------------------
  useEffect(() => {
    if (!number || !chatUrl) return;
    let cancelled = false;
    let app: { unmount?: () => void } | undefined;
    (async () => {
      const { createChat } = await import("@n8n/chat");
      if (cancelled) return;
      app = createChat({
        webhookUrl: chatUrl,
        target: "#demo-chat-target",
        mode: "fullscreen",
        showWelcomeScreen: false,
        loadPreviousSession: false,
        // Derived from the persona's number; the nonce makes "Reset" start fresh bot memory.
        sessionId: `demo-${digitsOnly(number)}-${nonce}`,
        chatSessionKey: `victoria-demo-session`,
        metadata: { whatsapp_number: number },
        initialMessages: [
          "Hi! 👋 Welcome to Victoria Car Rental. How can I help you today?",
        ],
        i18n: {
          en: {
            title: "Victoria Car Rental",
            subtitle: "Typically replies in a few seconds",
            footer: "",
            getStarted: "New conversation",
            inputPlaceholder: "Type a message…",
            closeButtonTooltip: "Close",
          },
        },
      }) as unknown as { unmount?: () => void };
    })();
    return () => {
      cancelled = true;
      app?.unmount?.();
    };
  }, [number, nonce, chatUrl]);

  const resetConversation = useCallback(async () => {
    if (!number) return;
    setBusy(true);
    try {
      await fetch("/api/demo/chat/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ whatsapp_number: number }),
      });
    } finally {
      setTeamMessages([]);
      lastTeamAt.current = null;
      setNonce(Date.now().toString(36));
      setBusy(false);
    }
  }, [number]);

  // --- messages the dashboard pushed to this customer ------------------------
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);
  const lastTeamAt = useRef<string | null>(null);
  useEffect(() => {
    if (!number) return;
    let stopped = false;
    const tick = async () => {
      try {
        const qs = new URLSearchParams({ whatsapp_number: number });
        if (lastTeamAt.current) qs.set("after", lastTeamAt.current);
        const res = await fetch(`/api/demo/chat/messages?${qs}`, {
          cache: "no-store",
        });
        const json = await res.json();
        const fresh: TeamMessage[] = json?.data?.messages ?? [];
        if (!stopped && fresh.length > 0) {
          lastTeamAt.current = fresh[fresh.length - 1].created_at;
          setTeamMessages((prev) => [
            ...prev,
            ...fresh.filter((m) => !prev.some((p) => p.id === m.id)),
          ]);
        }
      } catch {
        // transient; next tick retries
      }
    };
    lastTeamAt.current = new Date().toISOString();
    setTeamMessages([]);
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [number, nonce]);

  // --- live dashboard feed ----------------------------------------------------
  const [feed, setFeed] = useState<FeedData | null>(null);
  // Items present on first load are "old"; anything arriving later is highlighted as NEW.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/demo/feed", { cache: "no-store" });
        const json = await res.json();
        if (stopped || !json?.ok) return;
        const data: FeedData = json.data;
        setFeed(data);
        setBaseline(
          (prev) =>
            prev ??
            new Set([
              ...data.notifications.map((n) => n.id),
              ...data.bookings.map((b) => b.id),
            ]),
        );
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
  const isNew = (id: string) => baseline !== null && !baseline.has(id);

  const tab =
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors border";
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 bg-white p-4 text-zinc-900 md:bg-transparent">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">
          Victoria Car Rental <span className="text-zinc-400">· chat demo</span>
        </h1>
        <a
          href="/dashboard"
          target="_blank"
          rel="noreferrer"
          className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Open dashboard ↗
        </a>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <button
          className={`${tab} ${persona === "new" ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:bg-zinc-100"}`}
          onClick={() => setPersona("new")}
        >
          New customer
        </button>
        <button
          className={`${tab} ${persona === "existing" ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:bg-zinc-100"}`}
          onClick={() => setPersona("existing")}
        >
          Existing customer · Vitz rental, due back tomorrow
        </button>
        <button
          className={`${tab} ${persona === "custom" ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:bg-zinc-100"}`}
          onClick={() => setPersona("custom")}
        >
          Custom number
        </button>
        {persona === "custom" && (
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.trim())}
            aria-label="Custom WhatsApp number"
            placeholder="+23057990001"
            className={`w-40 rounded border px-2 py-1.5 text-sm ${CUSTOM_PATTERN.test(custom) ? "" : "border-red-400"}`}
          />
        )}
        <button
          onClick={resetConversation}
          disabled={busy || !number}
          className="ml-auto rounded border px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
        >
          Reset conversation
        </button>
      </section>
      <p className="-mt-2 text-xs text-zinc-500">
        Chatting as <b>{number || "—"}</b>
        {persona === "custom" &&
          " (custom numbers must look like +23057990001)"}
      </p>

      <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {!chatUrl && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <b>Chat not connected.</b> Set{" "}
              <code>NEXT_PUBLIC_N8N_CHAT_URL</code> to your n8n Chat Trigger
              webhook URL and redeploy.
            </div>
          )}
          {teamMessages.length > 0 && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                Message from the team
              </div>
              {teamMessages.map((m) => (
                <p key={m.id} className="whitespace-pre-wrap">
                  {m.body}
                </p>
              ))}
            </div>
          )}
          <div
            id="demo-chat-target"
            className="h-[70vh] min-h-[420px] overflow-hidden rounded-xl border bg-white shadow-sm [&>div]:h-full"
            style={{ ["--chat--color-primary" as string]: "#059669" }}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">
              Owner notifications (live)
            </h2>
            {feed?.notifications.length === 0 && (
              <p className="text-sm text-zinc-500">Nothing open.</p>
            )}
            <ul className="space-y-1.5">
              {feed?.notifications.map((n) => (
                <li
                  key={n.id}
                  className={`rounded border p-2 text-sm ${isNew(n.id) ? "border-amber-400 bg-amber-50" : ""}`}
                >
                  <span className="mr-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold">
                    {n.type.replace(/_/g, " ")}
                  </span>
                  {isNew(n.id) && (
                    <span className="mr-1 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold">
                      NEW
                    </span>
                  )}
                  {n.title}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">
              Latest bookings (live)
            </h2>
            <ul className="space-y-1.5">
              {feed?.bookings.map((b) => (
                <li
                  key={b.id}
                  className={`rounded border p-2 text-sm ${isNew(b.id) ? "border-amber-400 bg-amber-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b>#{b.booking_number}</b>
                    {isNew(b.id) && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold">
                        NEW
                      </span>
                    )}
                    <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold">
                      {b.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-zinc-600">
                    {b.customers?.full_name ?? b.customers?.whatsapp_number} ·{" "}
                    {b.vehicles
                      ? `${b.vehicles.make} ${b.vehicles.model}`
                      : "no car yet"}
                    {b.total_rs != null &&
                      ` · Rs ${b.total_rs.toLocaleString("en-US")}`}
                    {` · ${b.payment_status}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
