export type ParseResult<V, R extends string = string> =
  | { ok: true; value: V }
  | { ok: false; reason: R; detail?: Record<string, unknown> };

export const ok = <V>(value: V): { ok: true; value: V } => ({
  ok: true,
  value,
});
export const fail = <R extends string>(
  reason: R,
  detail?: Record<string, unknown>,
): { ok: false; reason: R; detail?: Record<string, unknown> } => ({
  ok: false,
  reason,
  detail,
});
