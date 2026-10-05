import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Minimal in-memory stand-in for the Supabase query builder — just the operators our domain code uses. */
export function createFakeSupabase(tables: Tables): SupabaseClient {
  let counter = 0;
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "update" | "insert" | "delete" = "select";
    let patch: Row = {};
    let head = false;
    let inserted: Row[] = [];
    const run = () => {
      const rows = tables[name];
      if (mode === "insert") return inserted;
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "update") matched.forEach((r) => Object.assign(r, patch));
      if (mode === "delete")
        tables[name] = rows.filter((r) => !matched.includes(r));
      return matched;
    };
    const cmp = (col: string, f: (v: unknown) => boolean) => (r: Row) =>
      f(r[col]);
    const api: Record<string, unknown> = {
      select: (_c?: string, opts?: { head?: boolean }) => {
        head = !!opts?.head;
        return api;
      },
      insert: (v: Row | Row[]) => {
        mode = "insert";
        inserted = (Array.isArray(v) ? v : [v]).map((x) => ({
          id: `${name}-${++counter}`,
          ...x,
        }));
        tables[name].push(...inserted);
        return api;
      },
      update: (v: Row) => {
        mode = "update";
        patch = v;
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push(cmp(c, (x) => x === v));
        return api;
      },
      neq: (c: string, v: unknown) => {
        filters.push(cmp(c, (x) => x !== v));
        return api;
      },
      in: (c: string, v: unknown[]) => {
        filters.push(cmp(c, (x) => v.includes(x)));
        return api;
      },
      is: (c: string, v: unknown) => {
        filters.push(cmp(c, (x) => (x ?? null) === v));
        return api;
      },
      lt: (c: string, v: string) => {
        filters.push(
          cmp(c, (x) => typeof x === "string" && Date.parse(x) < Date.parse(v)),
        );
        return api;
      },
      gt: (c: string, v: string) => {
        filters.push(
          cmp(c, (x) => typeof x === "string" && Date.parse(x) > Date.parse(v)),
        );
        return api;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => {
        const r = run()[0];
        return { data: r ?? null, error: r ? null : { message: "not found" } };
      },
      then: (resolve: (v: unknown) => unknown) => {
        const rows = run();
        return Promise.resolve(
          resolve({
            data: head ? null : rows,
            count: rows.length,
            error: null,
          }),
        );
      },
    };
    return api;
  };
  return { from } as unknown as SupabaseClient;
}
