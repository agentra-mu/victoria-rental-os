"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Msg {
  direction: string;
  sender: string;
  body: string;
  created_at: string;
}

export default function Simulator() {
  const [phone, setPhone] = useState("+23057000001");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [uploadLink, setUploadLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/dev/simulator?phone=${encodeURIComponent(phone)}`,
    );
    if (!res.ok) return;
    const j = await res.json();
    setMsgs(j.messages ?? []);
    setUploadLink(j.uploadLink ?? null);
  }, [phone]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView();
  }, [msgs]);

  async function send(payload: { text?: string; replyId?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/dev/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, ...payload }),
    });
    if (!res.ok) setError(`Agent call failed (${res.status})`);
    setText("");
    await load();
    setBusy(false);
  }

  const buttons = [
    "menu_view_cars",
    "menu_check_availability",
    "menu_existing_booking",
    "menu_talk_human",
    "confirm_booking",
    "change_details",
    "cancel_booking",
  ];

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="mb-1 text-lg font-semibold">WhatsApp simulator</h1>
      <p className="mb-3 text-xs text-zinc-500">
        Chat with the agent as a fake number — no Meta needed. Replies are shown
        from the stored thread.
      </p>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="mb-2 w-full rounded border p-2 text-sm"
      />
      <div className="mb-2 flex h-96 flex-col gap-2 overflow-y-auto rounded bg-zinc-100 p-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg p-2 text-sm whitespace-pre-wrap ${m.direction === "INBOUND" ? "self-end bg-green-100" : "self-start bg-white"}`}
          >
            {m.body}
          </div>
        ))}
        <div ref={end} />
      </div>
      {uploadLink && (
        <p className="mb-2 text-sm">
          Document upload link:{" "}
          <a className="underline" href={uploadLink} target="_blank">
            {uploadLink}
          </a>
        </p>
      )}
      <div className="mb-2 flex flex-wrap gap-1">
        {buttons.map((b) => (
          <button
            key={b}
            disabled={busy}
            onClick={() => send({ replyId: b })}
            className="rounded-full border px-2 py-1 text-xs"
          >
            {b}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send({ text });
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded border p-2 text-sm"
        />
        <button disabled={busy} className="rounded bg-black px-3 text-white">
          {busy ? "…" : "Send"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </main>
  );
}
