import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { deleteRow, upsertRow } from "@/lib/dashboard/crud";
import { Card, btn, btnPrimary, input } from "../../../_components/ui";

export const dynamic = "force-dynamic";
const PATH = "/dashboard/settings/snippets";

export default async function Snippets() {
  await requireStaff("settings");
  const db = getServiceSupabase();
  const [{ data: snippets }, { data: templates }] = await Promise.all([
    db.from("quick_replies").select("*").order("label"),
    db.from("message_templates").select("*").order("kind"),
  ]);

  async function addSnippet(fd: FormData) {
    "use server";
    await upsertRow("settings", "quick_replies", PATH, {
      label: String(fd.get("label")),
      body: String(fd.get("body")),
    });
  }
  async function delSnippet(fd: FormData) {
    "use server";
    await deleteRow("settings", "quick_replies", PATH, String(fd.get("id")));
  }
  async function saveTemplate(fd: FormData) {
    "use server";
    const { requireAction, audit } = await import("@/lib/dashboard/auth");
    const staff = await requireAction("settings");
    const { revalidatePath } = await import("next/cache");
    await getServiceSupabase()
      .from("message_templates")
      .upsert({
        kind: String(fd.get("kind")),
        template_name: String(fd.get("template_name")),
        language: String(fd.get("language") || "en"),
        parameter_mapping: JSON.parse(
          String(fd.get("parameter_mapping") || "[]"),
        ),
      });
    await audit(
      staff,
      "message_templates.upsert",
      "message_templates",
      String(fd.get("kind")),
    );
    revalidatePath(PATH);
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Quick replies</h1>
      <Card>
        <form action={addSnippet} className="grid gap-2">
          <input
            name="label"
            placeholder="Button label"
            required
            className={input}
          />
          <textarea
            name="body"
            placeholder="Message text"
            required
            rows={2}
            className={input}
          />
          <button className={btnPrimary}>Add</button>
        </form>
        <ul className="mt-3 text-sm">
          {(snippets ?? []).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between border-b py-1"
            >
              <span>
                <b>{s.label}</b> — {s.body}
              </span>
              <form action={delSnippet}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-red-700 underline">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <h1 className="mb-3 text-xl font-semibold">
        WhatsApp templates (approved by Meta)
      </h1>
      <p className="mb-2 text-sm text-zinc-600">
        kind = reminder key (pickup_reminder, pickup_day, return_reminder,
        thank_you, docs_nudge_1, docs_nudge_2, reopen). See
        docs/whatsapp-templates.md.
      </p>
      <Card>
        <form action={saveTemplate} className="grid grid-cols-2 gap-2">
          <input name="kind" placeholder="kind" required className={input} />
          <input
            name="template_name"
            placeholder="Meta template name"
            required
            className={input}
          />
          <input
            name="language"
            placeholder="en"
            defaultValue="en"
            className={input}
          />
          <input
            name="parameter_mapping"
            placeholder='["customer_name","pickup_time"]'
            defaultValue="[]"
            className={input}
          />
          <button className={`${btn} col-span-2`}>Save template</button>
        </form>
        <ul className="mt-3 text-sm">
          {(templates ?? []).map((t) => (
            <li key={t.kind} className="border-b py-1">
              <b>{t.kind}</b> → {t.template_name} ({t.language}){" "}
              {JSON.stringify(t.parameter_mapping)}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
