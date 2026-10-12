import type { z } from "zod";
import { normalize } from "@/lib/bot/text";
import { LlmError, type LLMProvider, type LlmPurpose } from "./provider";

export interface LlmLogRow {
  conversationId: string;
  customerId: string;
  messageId?: string | null;
  purpose: LlmPurpose;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LlmLogPort {
  record(row: LlmLogRow): Promise<void>;
  countSince(
    scope: { conversationId?: string; customerId?: string },
    since: Date,
  ): Promise<number>;
}

export interface GatewayConfig {
  perConversationPerDay: number;
  perCustomerPerDay: number;
  /** Customer text longer than this is cut before it reaches the model. */
  maxInputChars: number;
  timeoutMs: number;
  cacheTtlMs: number;
}

function num(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return process.env[name] !== undefined &&
    process.env[name] !== "" &&
    Number.isFinite(n)
    ? n
    : fallback;
}

export function loadGatewayConfig(): GatewayConfig {
  return {
    perConversationPerDay: num("LLM_MAX_CALLS_PER_CONVERSATION_PER_DAY", 6),
    perCustomerPerDay: num("LLM_MAX_CALLS_PER_CUSTOMER_PER_DAY", 15),
    maxInputChars: num("LLM_MAX_INPUT_CHARS", 1500),
    timeoutMs: num("LLM_TIMEOUT_MS", 4000),
    cacheTtlMs: num("LLM_CACHE_TTL_MS", 24 * 60 * 60 * 1000),
  };
}

export type GatewayFailure =
  "disabled" | "cap" | "turn_limit" | "timeout" | "error";

export type GatewayOutcome<T> =
  | { ok: true; value: T; cached: boolean; ms: number }
  | { ok: false; reason: GatewayFailure; ms: number };

export interface LlmCallArgs<T> {
  purpose: LlmPurpose;
  prompt: string;
  system?: string;
  schema: z.ZodType<T>;
  /** Raw customer text — used for the cache key (normalised) and length cap. */
  cacheText: string;
  /** Extra discriminator for the cache key (e.g. the step or the KB ids offered). */
  cacheScope?: string;
  maxOutputTokens?: number;
}

/** Per-turn handle: enforces "max 1 LLM call per turn" and accumulates timing for the turn log. */
export interface TurnLlm {
  readonly enabled: boolean;
  /** Calls actually sent to the provider this turn (cache hits don't count). */
  calls: number;
  ms: number;
  call<T>(args: LlmCallArgs<T>): Promise<GatewayOutcome<T>>;
}

export interface LlmGateway {
  readonly enabled: boolean;
  readonly provider: LLMProvider;
  forTurn(ctx: {
    conversationId: string;
    customerId: string;
    messageId?: string | null;
  }): TurnLlm;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}
// Process-wide so identical questions are free across requests on a warm instance.
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 500;

export function clearLlmCache(): void {
  CACHE.clear();
}

export function createLlmGateway(deps: {
  provider: LLMProvider;
  log: LlmLogPort;
  config?: GatewayConfig;
  now?: () => Date;
}): LlmGateway {
  const config = deps.config ?? loadGatewayConfig();
  const nowFn = deps.now ?? (() => new Date());

  return {
    enabled: deps.provider.available,
    provider: deps.provider,
    forTurn(ctx) {
      const turn: TurnLlm = {
        enabled: deps.provider.available,
        calls: 0,
        ms: 0,
        async call<T>(args: LlmCallArgs<T>): Promise<GatewayOutcome<T>> {
          const started = Date.now();
          const done = <R extends GatewayOutcome<T>>(r: R): R => {
            turn.ms += Date.now() - started;
            return r;
          };
          if (!deps.provider.available)
            return done({ ok: false, reason: "disabled", ms: 0 });
          if (turn.calls >= 1)
            return done({ ok: false, reason: "turn_limit", ms: 0 });

          const key = `${deps.provider.name}|${deps.provider.model}|${args.purpose}|${args.cacheScope ?? ""}|${normalize(args.cacheText)}`;
          const hit = CACHE.get(key);
          if (hit && hit.expiresAt > nowFn().getTime()) {
            return done({
              ok: true,
              value: hit.value as T,
              cached: true,
              ms: 0,
            });
          }

          const since = new Date(nowFn().getTime() - 24 * 60 * 60 * 1000);
          try {
            const [perConversation, perCustomer] = await Promise.all([
              deps.log.countSince(
                { conversationId: ctx.conversationId },
                since,
              ),
              deps.log.countSince({ customerId: ctx.customerId }, since),
            ]);
            if (
              perConversation >= config.perConversationPerDay ||
              perCustomer >= config.perCustomerPerDay
            ) {
              return done({
                ok: false,
                reason: "cap",
                ms: Date.now() - started,
              });
            }
          } catch {
            // If we can't prove we're under the cap, don't call.
            return done({ ok: false, reason: "cap", ms: Date.now() - started });
          }

          turn.calls += 1;
          try {
            const result = await Promise.race([
              deps.provider.generateJson(args.prompt, args.schema, {
                system: args.system,
                maxOutputTokens: args.maxOutputTokens,
                timeoutMs: config.timeoutMs,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new LlmError("TIMEOUT", "gateway timeout")),
                  config.timeoutMs + 250,
                ),
              ),
            ]);
            // Logging must never break a turn.
            await deps.log
              .record({
                conversationId: ctx.conversationId,
                customerId: ctx.customerId,
                messageId: ctx.messageId,
                purpose: args.purpose,
                provider: deps.provider.name,
                model: result.model,
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                latencyMs: result.latencyMs,
              })
              .catch(() => undefined);
            if (CACHE.size >= CACHE_MAX) {
              const oldest = CACHE.keys().next().value;
              if (oldest !== undefined) CACHE.delete(oldest);
            }
            CACHE.set(key, {
              value: result.value,
              expiresAt: nowFn().getTime() + config.cacheTtlMs,
            });
            return done({
              ok: true,
              value: result.value,
              cached: false,
              ms: result.latencyMs,
            });
          } catch (error) {
            // A failed attempt still counts against the cap (it cost a request).
            await deps.log
              .record({
                conversationId: ctx.conversationId,
                customerId: ctx.customerId,
                messageId: ctx.messageId,
                purpose: args.purpose,
                provider: deps.provider.name,
                model: deps.provider.model,
                inputTokens: 0,
                outputTokens: 0,
                latencyMs: Date.now() - started,
              })
              .catch(() => undefined);
            const timeout =
              error instanceof LlmError && error.code === "TIMEOUT";
            return done({
              ok: false,
              reason: timeout ? "timeout" : "error",
              ms: Date.now() - started,
            });
          }
        },
      };
      return turn;
    },
  };
}

/** Customer text is data, never instructions: cap its length and remove anything that could close our delimiters. */
export function sanitizeCustomerText(text: string, maxChars: number): string {
  return text
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}
