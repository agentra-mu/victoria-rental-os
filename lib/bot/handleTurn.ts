import { log } from "@/lib/monitoring/log";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type { ConversationRow, CustomerRow } from "@/lib/whatsapp/ports";
import { createCtx, type TurnCtx } from "./context";
import { failStep, hasParser, runCurrentStep } from "./engine";
import { enterStep } from "./flow";
import type { Handled } from "./handled";
import { looksLikeQuestion, matchIntent } from "./lexicon";
import { handleCommand } from "./layers/commands";
import { answerWith, findByKeyword, findBySearch } from "./layers/faq";
import { llmFallback } from "./layers/fallback";
import { routeIntent } from "./layers/intents";
import { handleButton } from "./layers/structured";
import { detectLanguage } from "./parsers/language";
import type { BotDeps } from "./ports";
import {
  readState,
  type InboundInput,
  type Lang,
  type TurnResult,
} from "./types";

export interface InboundMessage {
  /** Meta's message id (dedupe key); used to correlate logs. */
  messageId?: string;
  type:
    "text" | "button_reply" | "list_reply" | "image" | "document" | "location";
  text?: string;
  replyId?: string;
}

const URGENT_INTENTS = new Set(["payment_claim", "incident", "cash_issue"]);

function toInput(m: InboundMessage): InboundInput {
  if ((m.type === "button_reply" || m.type === "list_reply") && m.replyId) {
    return { kind: "button", id: m.replyId, title: m.text };
  }
  if (m.type === "image" || m.type === "document" || m.type === "location") {
    return { kind: "media", mediaType: m.type };
  }
  return { kind: "text", text: m.text ?? "" };
}

async function handleMedia(ctx: TurnCtx): Promise<Handled> {
  const booking = await ctx.getActiveBooking();
  const url = booking?.uploadToken
    ? `${ctx.deps.appUrl()}/documents/${booking.uploadToken}`
    : null;
  return {
    replies: [ctx.t.mediaNotAccepted(url)],
    handledBy: "state_machine",
    matched: "media",
  };
}

/** Text path: commands → FAQ keywords → the current step's parser → intents → FTS → LLM → menu. */
async function handleText(ctx: TurnCtx, text: string): Promise<Handled> {
  const command = await handleCommand(ctx, text);
  if (command) return command;

  const step = ctx.state.step;
  const parser = hasParser(step);
  const question = looksLikeQuestion(text);

  // Statements that must never be mistaken for an FAQ or a form answer ("I already paid", an accident).
  if (!question) {
    const urgent = matchIntent(text);
    if (urgent && URGENT_INTENTS.has(urgent)) {
      const routed = await routeIntent(ctx, urgent, text);
      if (routed) return routed;
    }
  }

  // A question wins over a step's parser; a plain answer is tried by the parser first.
  if (!parser || question) {
    const kw = await findByKeyword(ctx, text);
    if (kw) return answerWith(ctx, kw.entry, `faq:${kw.via}`);
  }

  if (parser) {
    const ran = await runCurrentStep(
      ctx,
      { kind: "text", text },
      "state_machine",
    );
    if (ran && "handled" in ran) return ran.handled;
    if (ran && "failed" in ran) {
      // Not a valid answer here — but it may be a different request ("I'll be late", "cars").
      const intent = matchIntent(text);
      if (intent) {
        const routed = await routeIntent(ctx, intent, text);
        if (routed) return routed;
      }
      if (!ran.failed.noRetry) {
        const kw = await findByKeyword(ctx, text);
        if (kw) return answerWith(ctx, kw.entry, `faq:${kw.via}`);
        if (question) {
          const hit = await findBySearch(ctx, text);
          if (hit)
            return answerWith(
              ctx,
              hit.entry,
              `faq:fts:${hit.score.toFixed(2)}`,
            );
        }
      }
      return failStep(ctx, ran.failed, "state_machine");
    }
  }

  const intent = matchIntent(text);
  if (intent) {
    const routed = await routeIntent(ctx, intent, text);
    if (routed) return routed;
  }

  if (!parser || question) {
    const hit = await findBySearch(ctx, text);
    if (hit)
      return answerWith(ctx, hit.entry, `faq:fts:${hit.score.toFixed(2)}`);
  }

  return llmFallback(ctx, text);
}

/**
 * One customer turn. Runs the layers in order and stops at the first that
 * handles the message: structured IDs → global commands → FAQ → the state
 * machine → existing-booking → (optional) LLM fallback. Conversation logic is
 * deterministic; the LLM is a last resort and the whole thing works with
 * LLM_ENABLED=false.
 */
export async function handleTurn(
  deps: BotDeps,
  conversationId: string,
  message: InboundMessage,
  preloaded?: { customer: CustomerRow; conversation: ConversationRow },
): Promise<TurnResult> {
  const started = Date.now();
  const conversation =
    preloaded?.conversation ??
    (await deps.messaging.getConversationById(conversationId));
  if (!conversation)
    throw new Error(`Conversation ${conversationId} not found`);
  const customer =
    preloaded?.customer ??
    (await deps.messaging.getCustomerById(conversation.customerId));
  if (!customer)
    throw new Error(`Customer ${conversation.customerId} not found`);

  const state = readState(conversation.state);
  const input = toInput(message);
  const llm = deps.llm?.enabled
    ? deps.llm.forTurn({
        conversationId,
        customerId: customer.id,
        messageId: message.messageId,
      })
    : null;
  const startLang: Lang = state.lang ?? customer.preferredLanguage ?? "en";
  const ctx = createCtx({
    deps,
    customer,
    conversation,
    state,
    lang: startLang,
    input,
    llm,
  });
  const stepBefore = state.step;
  const text =
    input.kind === "text"
      ? input.text
      : input.kind === "button"
        ? (input.title ?? "")
        : "";

  let detectedLang: Lang | null = null;
  if (input.kind === "text") {
    const detected = detectLanguage(input.text, startLang);
    if (detected.confident) {
      detectedLang = detected.lang;
      if (detected.lang !== ctx.lang) ctx.setLang(detected.lang);
    }
  }
  ctx.state.lang = ctx.lang;

  let handled: Handled;
  try {
    if (input.kind === "media") {
      handled = await handleMedia(ctx);
    } else if (input.kind === "button") {
      handled =
        (await handleButton(ctx, input.id)) ??
        (text
          ? await handleText(ctx, text)
          : {
              replies: await enterStep(ctx, "MENU"),
              handledBy: "state_machine",
              matched: "button:unknown",
            });
    } else {
      handled = await handleText(ctx, input.text);
    }
  } catch (error) {
    console.error("[bot] turn failed", { conversationId, error });
    handled = {
      replies: [ctx.t.genericError()],
      handledBy: "state_machine",
      matched: "error",
    };
  }

  if (!handled.unrecognised) ctx.state.unknownStreak = 0;

  // Persist state, the customer's language and the turn log together (one round trip's worth of waiting).
  const languageChanged =
    detectedLang !== null &&
    detectedLang !== (customer.preferredLanguage ?? null);
  const totalMs = Date.now() - started;
  const trace = {
    layer: handled.handledBy,
    matched: handled.matched,
    parsed: ctx.parsed,
    unrecognised: handled.unrecognised,
    llmCalls: llm?.calls ?? 0,
    step: stepBefore,
    nextStep: ctx.state.step,
    totalMs,
    dbMs: ctx.timing.dbMs,
    llmMs: llm?.ms ?? 0,
  };

  await Promise.all([
    ctx.messaging.updateConversationState(
      conversationId,
      ctx.state as unknown as Record<string, unknown>,
    ),
    languageChanged
      ? ctx.messaging.setCustomerLanguage(customer.id, ctx.lang)
      : null,
    deps.turnLog
      ?.record({
        conversationId,
        customerId: customer.id,
        messageId: message.messageId ?? null,
        layer: handled.handledBy,
        matched: handled.matched,
        step: stepBefore,
        nextStep: ctx.state.step,
        totalMs,
        dbMs: ctx.timing.dbMs,
        llmMs: llm?.ms ?? 0,
        llmCalls: llm?.calls ?? 0,
        unrecognised: Boolean(handled.unrecognised),
        inboundText: handled.unrecognised ? text.slice(0, 300) : null,
        parsed: Object.keys(ctx.parsed).length ? ctx.parsed : null,
        bookingId: ctx.confirmedBookingId ?? ctx.state.draftBookingId ?? null,
        bookingConfirmed: ctx.bookingConfirmed,
      })
      .catch((error) => console.error("[bot] turn log failed", error)),
  ]);

  log.info("bot_turn", {
    layer: handled.handledBy,
    matched: handled.matched,
    step: stepBefore,
    next: ctx.state.step,
    totalMs,
    dbMs: ctx.timing.dbMs,
    llmMs: llm?.ms ?? 0,
    llmCalls: llm?.calls ?? 0,
  });

  return {
    replies: handled.replies as WhatsAppReply[],
    handledBy: handled.handledBy,
    trace,
    generatedBy: handled.generatedBy,
    notifyOwner: handled.notifyOwner,
  };
}
