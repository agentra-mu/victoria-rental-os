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
      <h1 className="mb-3 text-xl font-semibold">Knowledge base</h1>
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
