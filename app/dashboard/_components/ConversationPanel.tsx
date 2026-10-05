import { getServiceSupabase } from "@/lib/supabase/server";
import { isWithin24hWindow } from "@/lib/domain/takeover";
import { can, type StaffIdentity } from "@/lib/domain/permissions";
import {
  assignConversation,
  handBackToAI,
  takeOver,
} from "../_actions/conversation";
import Composer from "./Composer";
import AutoRefresh from "./AutoRefresh";
import { btn, fmtDateTime } from "./ui";

/** Transcript + takeover controls + composer for one conversation. Refreshes itself every few seconds. */
export default async function ConversationPanel({
  conversationId,
  staff,
}: {
  conversationId: string;
  staff: StaffIdentity;
}) {
  const db = getServiceSupabase();
  const [
    { data: conv },
    { data: messages },
    { data: snippets },
    { data: templates },
    { data: team },
  ] = await Promise.all([
    db
      .from("conversations")
      .select("id, mode, assigned_to, taken_over_at")
      .eq("id", conversationId)
      .single(),
    db
      .from("messages")
      .select("id, direction, sender, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200),
    db.from("quick_replies").select("id, label, body").order("label"),
    db.from("message_templates").select("kind, template_name").order("kind"),
    db.from("staff_users").select("id, name").eq("active", true),
  ]);
  if (!conv)
    return <p className="text-sm text-zinc-500">No conversation yet.</p>;

  const lastInbound =
    [...(messages ?? [])].reverse().find((m) => m.direction === "INBOUND")
      ?.created_at ?? null;
  const withinWindow = isWithin24hWindow(lastInbound, new Date());
  const human = conv.mode === "HUMAN";
  const mayTakeover = can(staff, "takeover");

  const style: Record<string, string> = {
    customer: "bg-white border mr-8",
    ai: "bg-blue-50 border border-blue-100 ml-8",
    owner: "bg-green-50 border border-green-200 ml-8",
  };

  return (
    <div>
      <AutoRefresh seconds={6} />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${human ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
        >
          {human ? "HUMAN mode — AI is silent" : "AI handling"}
        </span>
        {mayTakeover && (
          <form action={human ? handBackToAI : takeOver}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button className={btn}>
              {human ? "Return to AI" : "Take over conversation"}
            </button>
          </form>
        )}
        <form
          action={assignConversation}
          className="ml-auto flex items-center gap-1 text-xs"
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <select
            name="staffId"
            defaultValue={conv.assigned_to ?? ""}
            className="rounded border p-1"
          >
            <option value="">Unassigned</option>
            {(team ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="rounded border px-2 py-1">Assign</button>
        </form>
      </div>
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded bg-zinc-100 p-3">
        {(messages ?? []).map((m) => (
          <div
            key={m.id}
            className={`rounded-lg p-2 text-sm whitespace-pre-wrap ${style[m.sender] ?? style.customer}`}
          >
            <div className="mb-0.5 text-[10px] text-zinc-500 uppercase">
              {m.sender} · {fmtDateTime(m.created_at)}
            </div>
            {m.body}
          </div>
        ))}
        {(messages ?? []).length === 0 && (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        )}
      </div>
      {human && mayTakeover && (
        <Composer
          conversationId={conversationId}
          withinWindow={withinWindow}
          snippets={snippets ?? []}
          templates={templates ?? []}
        />
      )}
      {!human && mayTakeover && (
        <p className="mt-2 text-xs text-zinc-500">
          Take over to reply as the business.
        </p>
      )}
    </div>
  );
}
