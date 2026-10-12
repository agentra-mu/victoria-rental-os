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

  const pill = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-all ${
      active
        ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
        : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
    }`;
  const card = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm";
  const badge =
    "rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase";
  const newBadge =
    "rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950";

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-zinc-50 to-zinc-100 text-zinc-900">
      <header className="border-b border-emerald-900/10 bg-emerald-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl">
            🚗
          </div>
          <div className="mr-auto">
            <h1 className="text-lg leading-tight font-semibold">
              Victoria Car Rental
            </h1>
            <p className="text-xs text-emerald-100/80">
              Customer chat · live demo
            </p>
          </div>
          <a
            href="/dashboard"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
          >
            Open owner dashboard ↗
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold text-zinc-500">
              Chat as
            </h2>
            <button
              onClick={resetConversation}
              disabled={busy || !number}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              ↺ Reset conversation
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={pill(persona === "new")}
              onClick={() => setPersona("new")}
            >
              New customer
            </button>
            <button
              className={pill(persona === "existing")}
              onClick={() => setPersona("existing")}
            >
              Existing customer
              <span className="ml-1 hidden opacity-75 sm:inline">
                · Vitz, due back tomorrow
              </span>
            </button>
            <button
              className={pill(persona === "custom")}
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
                className={`w-44 rounded-lg border px-3 py-2 text-sm ${CUSTOM_PATTERN.test(custom) ? "border-zinc-200" : "border-red-400"}`}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Chatting as <b className="text-zinc-700">{number || "—"}</b>
            {persona === "custom" &&
              " (custom numbers must look like +23057990001)"}
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-3">
            {!chatUrl && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <b>Chat not connected.</b> Set{" "}
                <code>NEXT_PUBLIC_N8N_CHAT_URL</code> to your n8n Chat Trigger
                webhook URL and redeploy.
              </div>
            )}
            {teamMessages.length > 0 && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm shadow-sm">
                <div className="mb-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                  💬 Message from the team
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
              className="h-[72vh] min-h-[460px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg [&>div]:h-full"
              style={
                {
                  "--chat--color-primary": "#059669",
                  "--chat--color-primary-shade-50": "#047857",
                  "--chat--color-primary-shade-100": "#065f46",
                  "--chat--color-secondary": "#059669",
                  "--chat--header--background": "#064e3b",
                  "--chat--header--color": "#ffffff",
                  "--chat--header-height": "auto",
                  "--chat--message--bot--background": "#f4f4f5",
                  "--chat--message--bot--color": "#18181b",
                  "--chat--message--user--background": "#059669",
                  "--chat--message--user--color": "#ffffff",
                  "--chat--border-radius": "12px",
                  "--chat--message--border-radius": "16px",
                  "--chat--body--background": "#fafafa",
                  "--chat--footer--background": "#ffffff",
                  "--chat--input--font-size": "15px",
                } as React.CSSProperties
              }
            />
          </div>

          <aside className="flex flex-col gap-5">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              What the owner sees · live
            </div>
            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold">🔔 Notifications</h2>
              {feed?.notifications.length === 0 && (
                <p className="text-sm text-zinc-500">Nothing open.</p>
              )}
              <ul className="space-y-2">
                {feed?.notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`rounded-lg border p-2.5 text-sm ${isNew(n.id) ? "border-amber-400 bg-amber-50" : "border-zinc-100 bg-zinc-50"}`}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={badge}>{n.type.replace(/_/g, " ")}</span>
                      {isNew(n.id) && <span className={newBadge}>NEW</span>}
                    </div>
                    {n.title}
                  </li>
                ))}
              </ul>
            </section>
            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold">📋 Latest bookings</h2>
              <ul className="space-y-2">
                {feed?.bookings.map((b) => (
                  <li
                    key={b.id}
                    className={`rounded-lg border p-2.5 text-sm ${isNew(b.id) ? "border-amber-400 bg-amber-50" : "border-zinc-100 bg-zinc-50"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <b>#{b.booking_number}</b>
                      {isNew(b.id) && <span className={newBadge}>NEW</span>}
                      <span className={`${badge} ml-auto`}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
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
    </div>
  );
}
