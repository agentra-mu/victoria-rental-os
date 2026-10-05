"use client";

import { useRef, useState, useTransition } from "react";
import { draftReply, sendReply, sendTemplate } from "../_actions/conversation";
import { btn, btnPrimary } from "./ui";

export default function Composer({
  conversationId,
  withinWindow,
  snippets,
  templates,
}: {
  conversationId: string;
  withinWindow: boolean;
  snippets: { id: string; label: string; body: string }[];
  templates: { kind: string; template_name: string }[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (formData: FormData) =>
    start(async () => {
      setError(null);
      try {
        await sendReply(formData);
        if (ref.current) ref.current.value = "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed");
      }
    });

  return (
    <div className="mt-3">
      {!withinWindow && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          The customer hasn&apos;t messaged in the last 24 hours, so WhatsApp
          only allows an approved template message.
          {templates.length > 0 ? (
            <form
              action={(fd) =>
                start(async () => {
                  try {
                    await sendTemplate(fd);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed");
                  }
                })
              }
              className="mt-2 flex gap-2"
            >
              <input
                type="hidden"
                name="conversationId"
                value={conversationId}
              />
              <select name="templateKind" className="rounded border p-1">
                {templates.map((t) => (
                  <option key={t.kind} value={t.kind}>
                    {t.template_name}
                  </option>
                ))}
              </select>
              <button className={btn}>Send template</button>
            </form>
          ) : (
            <span> No templates configured yet (Settings → Templates).</span>
          )}
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-1">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            className="rounded-full border px-2 py-1 text-xs"
            onClick={() => {
              if (ref.current) ref.current.value = s.body;
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full border border-purple-300 px-2 py-1 text-xs text-purple-800"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const text = await draftReply(conversationId);
                if (ref.current) ref.current.value = text;
              } catch (e) {
                setError(e instanceof Error ? e.message : "Draft failed");
              }
            })
          }
        >
          ✨ Suggest reply
        </button>
      </div>
      <form action={send} className="flex gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea
          ref={ref}
          name="text"
          rows={2}
          className="flex-1 rounded border p-2 text-sm"
          placeholder="Reply as the business…"
        />
        <button className={btnPrimary} disabled={pending || !withinWindow}>
          Send
        </button>
      </form>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
