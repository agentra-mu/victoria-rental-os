"use client";

import { useEffect, useRef, useState } from "react";

type Reply =
  | { type: "text"; text: string }
  | {
      type: "buttons";
      interactive: {
        body: { text: string };
        action: { buttons: { reply: { id: string; title: string } }[] };
      };
    }
  | {
      type: "list";
      interactive: {
        body: { text: string };
        action: {
          button: string;
          sections: {
            rows: { id: string; title: string; description?: string }[];
          }[];
        };
      };
    };

interface ChatLine {
  id: number;
  from: "bot" | "me";
  reply?: Reply;
  text?: string;
  /** Layer that answered, e.g. "faq" — shown small under bot bubbles. */
  layer?: string;
}

interface BotResponse {
  replies: Reply[];
  layer?: string;
  failed?: boolean;
}

async function callBot(
  number: string,
  payload: { text?: string; reply_id?: string },
): Promise<BotResponse> {
  try {
    const res = await fetch("/api/demo/chat/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ whatsapp_number: number, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) return { replies: [], failed: true };
    return {
      replies: json?.data?.replies ?? [],
      layer: json?.data?.debug?.layer,
    };
  } catch {
    return { replies: [], failed: true };
  }
}

const bodyText = (reply?: Reply) =>
  reply?.type === "text" ? reply.text : reply?.interactive.body.text;

/** The demo chat: renders text, buttons and lists exactly as WhatsApp would, backed by the same bot as production. */
export default function Chat({ number }: { number: string }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);

  const botLines = (r: BotResponse): ChatLine[] =>
    r.failed
      ? [
          {
            id: nextId.current++,
            from: "bot",
            text: "Something went wrong — please try again.",
          },
        ]
      : r.replies.map((reply, i) => ({
          id: nextId.current++,
          from: "bot" as const,
          reply,
          layer: i === r.replies.length - 1 ? r.layer : undefined,
        }));

  // Greeting when the conversation starts (the component is re-mounted on persona change / reset).
  useEffect(() => {
    if (!number) return;
    let cancelled = false;
    callBot(number, { text: "menu" }).then((r) => {
      if (!cancelled) setLines(botLines(r));
    });
    return () => {
      cancelled = true;
    };
  }, [number]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  async function send(
    payload: { text?: string; reply_id?: string },
    shown: string,
  ) {
    setLines((l) => [...l, { id: nextId.current++, from: "me", text: shown }]);
    setSending(true);
    const r = await callBot(number, payload);
    setLines((l) => [...l, ...botLines(r)]);
    setSending(false);
  }

  return (
    <div className="flex h-[72vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
      <div className="bg-emerald-900 px-4 py-3 text-white">
        <div className="font-semibold">Victoria Car Rental</div>
        <div className="text-xs text-emerald-100/80">
          Replies instantly · no AI needed for a booking
        </div>
      </div>
      <div
        ref={scroller}
        className="flex-1 space-y-2 overflow-y-auto bg-zinc-50 p-4"
      >
        {lines.map((line) => (
          <div key={line.id} className={line.from === "me" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-left text-[15px] whitespace-pre-wrap ${
                line.from === "me"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-200/70 text-zinc-900"
              }`}
            >
              {line.text ?? bodyText(line.reply)}
            </div>
            {line.reply?.type === "buttons" && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {line.reply.interactive.action.buttons.map((b) => (
                  <button
                    key={b.reply.id}
                    disabled={sending}
                    onClick={() =>
                      send({ reply_id: b.reply.id }, b.reply.title)
                    }
                    className="rounded-full border border-emerald-600 bg-white px-3.5 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {b.reply.title}
                  </button>
                ))}
              </div>
            )}
            {line.reply?.type === "list" && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {line.reply.interactive.action.sections[0].rows.map((r) => (
                  <button
                    key={r.id}
                    disabled={sending}
                    onClick={() => send({ reply_id: r.id }, r.title)}
                    title={r.description}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-left text-sm hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <span className="font-medium">{r.title}</span>
                    {r.description && (
                      <span className="block text-xs text-zinc-500">
                        {r.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {line.layer && (
              <div className="mt-0.5 text-[10px] tracking-wide text-zinc-400 uppercase">
                handled by: {line.layer.replace(/_/g, " ")}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-zinc-200 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text || sending) return;
          setDraft("");
          void send({ text }, text);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-[15px]"
        />
        <button
          disabled={sending || !draft.trim()}
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
