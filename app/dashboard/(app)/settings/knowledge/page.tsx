import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { deleteRow, upsertRow } from "@/lib/dashboard/crud";
import { Card, btn, btnPrimary, input } from "../../../_components/ui";

export const dynamic = "force-dynamic";
const PATH = "/dashboard/settings/knowledge";

export default async function Knowledge() {
  await requireStaff("settings");
  const { data } = await getServiceSupabase()
    .from("knowledge_base")
    .select("*")
    .order("topic");

  async function save(fd: FormData) {
    "use server";
    await upsertRow(
      "settings",
      "knowledge_base",
      PATH,
      {
        topic: String(fd.get("topic")),
        question: String(fd.get("question")),
        answer: String(fd.get("answer")),
        question_fr: String(fd.get("question_fr") || "") || null,
        answer_fr: String(fd.get("answer_fr") || "") || null,
        intent_key: String(fd.get("intent_key") || "") || null,
        keywords: String(fd.get("keywords") || "")
          .split(",")
          .map((w) => w.trim())
          .filter(Boolean),
        active: fd.get("active") === "on",
      },
      String(fd.get("id") || "") || null,
    );
  }
  async function remove(fd: FormData) {
    "use server";
    await deleteRow("settings", "knowledge_base", PATH, String(fd.get("id")));
  }

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-zinc-900">
        Knowledge base
      </h1>
      <Card title="Add entry">
        <form action={save} className="grid gap-2">
          <input
            name="topic"
            placeholder="Topic (e.g. fuel)"
            required
            className={input}
          />
          <input
            name="question"
            placeholder="Question"
            required
            className={input}
          />
          <textarea
            name="answer"
            placeholder="Answer"
            required
            rows={2}
            className={input}
          />
          <input
            name="question_fr"
            placeholder="Question (French, optional)"
            className={input}
          />
          <textarea
            name="answer_fr"
            placeholder="Answer (French) — sent to customers writing in French"
            rows={2}
            className={input}
          />
          <input
            name="keywords"
            placeholder="Trigger words, comma separated (any language) — e.g. credit card, carte bancaire"
            className={input}
          />
          <input
            name="intent_key"
            placeholder="Intent key (optional): opening_hours, payment_methods, documents_required, fuel, mileage, cancellation, late_return, deposit, address"
            className={input}
          />
          <label className="text-sm">
            <input type="checkbox" name="active" defaultChecked /> Active
          </label>
          <button className={btnPrimary}>Add</button>
        </form>
      </Card>
      {(data ?? []).map((k) => (
        <Card key={k.id}>
          <form action={save} className="grid gap-2">
            <input type="hidden" name="id" value={k.id} />
            <input name="topic" defaultValue={k.topic} className={input} />
            <input
              name="question"
              defaultValue={k.question}
              className={input}
            />
            <textarea
              name="answer"
              defaultValue={k.answer}
              rows={2}
              className={input}
            />
            <input
              name="question_fr"
              defaultValue={k.question_fr ?? ""}
              placeholder="Question (French)"
              className={input}
            />
            <textarea
              name="answer_fr"
              defaultValue={k.answer_fr ?? ""}
              placeholder="Answer (French)"
              rows={2}
              className={input}
            />
            <input
              name="keywords"
              defaultValue={(k.keywords ?? []).join(", ")}
              placeholder="Trigger words, comma separated"
              className={input}
            />
            <input
              name="intent_key"
              defaultValue={k.intent_key ?? ""}
              placeholder="Intent key"
              className={input}
            />
            <label className="text-sm">
              <input type="checkbox" name="active" defaultChecked={k.active} />{" "}
              Active
            </label>
            <div className="flex gap-2">
              <button className={btn}>Save</button>
            </div>
          </form>
          <form action={remove} className="mt-2">
            <input type="hidden" name="id" value={k.id} />
            <button className="text-sm text-red-700 underline">Delete</button>
          </form>
        </Card>
      ))}
    </>
  );
}
