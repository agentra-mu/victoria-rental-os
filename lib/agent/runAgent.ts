import type Anthropic from "@anthropic-ai/sdk";
import {
  COMPANY_NAME,
  MAX_RESPONSE_TOKENS,
  MAX_TOOL_ITERATIONS,
} from "./config";
import { getAgentModel } from "./client";
import { loadAgentContext } from "./context";
import { buildSystemPrompt } from "./systemPrompt";
import { AGENT_TOOLS, executeTool, type ToolContext } from "./tools";
import type { AgentDeps } from "./ports";
import { buttonsReply, listReply, textReply } from "@/lib/whatsapp/replies";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type {
  ConversationState,
  MessageDirection,
  MessageRow,
} from "@/lib/whatsapp/ports";

const FALLBACK_REPLY_TEXT =
  "Sorry, I'm having trouble helping with that right now — I've asked a member of our team to step in and they'll be with you shortly.";

interface FleetLikeGroup {
  make: string;
  model: string;
  dailyPriceRs: number;
  vehicleIds: string[];
  available?: number;
  transmission?: string | null;
  seats?: number | null;
}

function mainMenuReply(): WhatsAppReply {
  return listReply(
    `Welcome to ${COMPANY_NAME}! How can we help today?`,
    "Menu",
    [
      { id: "menu_view_cars", title: "View cars" },
      { id: "menu_check_availability", title: "Check availability" },
      { id: "menu_existing_booking", title: "Existing booking" },
      { id: "menu_talk_human", title: "Talk to someone" },
    ],
  );
}

function roleForDirection(direction: MessageDirection): "user" | "assistant" {
  return direction === "INBOUND" ? "user" : "assistant";
}

/** Anthropic requires alternating user/assistant turns starting with "user" — collapse and trim history to fit. */
export function buildMessageHistory(
  messages: MessageRow[],
): Anthropic.Messages.MessageParam[] {
  const turns: Anthropic.Messages.MessageParam[] = [];
  for (const message of messages) {
    const role = roleForDirection(message.direction);
    const last = turns[turns.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${message.body}`;
    } else {
      turns.push({ role, content: message.body });
    }
  }
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

function fleetListReply(text: string, groups: FleetLikeGroup[]): WhatsAppReply {
  const rows = groups
    .filter((group) => group.vehicleIds.length > 0)
    .map((group) => {
      const details = [
        group.transmission,
        group.seats ? `${group.seats} seats` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        id: group.vehicleIds[0],
        title: `${group.make} ${group.model}`,
        description: `Rs ${group.dailyPriceRs}/day${details ? ` · ${details}` : ""}`,
      };
    });
  return listReply(text, "See cars", rows);
}

function summaryButtonsReply(text: string): WhatsAppReply {
  return buttonsReply(text, [
    { id: "confirm_booking", title: "Confirm" },
    { id: "change_details", title: "Change details" },
    { id: "cancel_booking", title: "Cancel" },
  ]);
}

/** Tries to parse a successful tool_result's { ok: true, data } envelope; returns null for errors or unparseable content. */
function parseToolData(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as { ok?: boolean; data?: unknown };
    return parsed.ok && parsed.data
      ? (parsed.data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function persistState(
  deps: AgentDeps,
  conversationId: string,
  state: ConversationState,
): Promise<void> {
  await deps.messaging.updateConversationState(conversationId, state);
}

/**
 * Runs one customer turn end to end: loads context, drives the Claude
 * tool-use loop (capped at MAX_TOOL_ITERATIONS), and returns the structured
 * WhatsApp replies to send. See prompts/05-ai-conversation-agent.md.
 */
export async function runAgentTurn(
  deps: AgentDeps,
  conversationId: string,
): Promise<WhatsAppReply[]> {
  const now = deps.now?.() ?? new Date();

  const conversation = await deps.messaging.getConversationById(conversationId);
  if (!conversation) return [textReply(FALLBACK_REPLY_TEXT)];
  const customer = await deps.messaging.getCustomerById(
    conversation.customerId,
  );
  if (!customer) return [textReply(FALLBACK_REPLY_TEXT)];

  const context = await loadAgentContext(
    deps,
    conversationId,
    customer,
    conversation,
  );
  const state: ConversationState = { ...conversation.state };

  if (context.isFirstContact) {
    await persistState(deps, conversationId, state);
    return [mainMenuReply()];
  }

  const toolCtx: ToolContext = {
    domainDb: deps.domainDb,
    messaging: deps.messaging,
    customer,
    conversationId,
    state,
    now,
  };

  const messages = buildMessageHistory(context.recentMessages);
  const system = buildSystemPrompt(context);
  const model = getAgentModel();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // Tracks only the most recent round of tool calls — what decides whether
  // the final reply renders as plain text, a fleet list or summary buttons.
  let lastRoundTools = new Set<string>();
  let lastRoundGroups: FleetLikeGroup[] | null = null;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await deps.model.createMessage({
        model,
        system,
        messages,
        tools: AGENT_TOOLS,
        maxTokens: MAX_RESPONSE_TOKENS,
      });
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter(
            (block): block is Anthropic.Messages.TextBlock =>
              block.type === "text",
          )
          .map((block) => block.text)
          .join("\n\n")
          .trim();

        console.info("[agent] token usage", {
          conversationId,
          iterations: iteration + 1,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });

        await persistState(deps, conversationId, state);
        return [
          buildFinalReply(
            text || FALLBACK_REPLY_TEXT,
            lastRoundTools,
            lastRoundGroups,
          ),
        ];
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );

      lastRoundTools = new Set<string>();
      lastRoundGroups = null;
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input, toolCtx);
        deps.onToolCall?.(block.name, block.input, result.content);
        lastRoundTools.add(block.name);
        if (
          !result.isError &&
          (block.name === "get_fleet" || block.name === "check_availability")
        ) {
          const data = parseToolData(result.content);
          const groups = data?.groups;
          if (Array.isArray(groups))
            lastRoundGroups = groups as FleetLikeGroup[];
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    // Cap reached without a final answer.
    return await escalateAndFallback(
      deps,
      toolCtx,
      "Reached the tool-call limit without finishing the customer's request.",
    );
  } catch (error) {
    console.error("[agent] turn failed", { conversationId, error });
    return await escalateAndFallback(
      deps,
      toolCtx,
      `Agent error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildFinalReply(
  text: string,
  lastRoundTools: Set<string>,
  lastRoundGroups: FleetLikeGroup[] | null,
): WhatsAppReply {
  if (lastRoundTools.has("get_price_quote")) return summaryButtonsReply(text);
  if (
    (lastRoundTools.has("get_fleet") ||
      lastRoundTools.has("check_availability")) &&
    lastRoundGroups &&
    lastRoundGroups.length > 0
  ) {
    return fleetListReply(text, lastRoundGroups);
  }
  return textReply(text);
}

async function escalateAndFallback(
  deps: AgentDeps,
  ctx: ToolContext,
  reason: string,
): Promise<WhatsAppReply[]> {
  try {
    await executeTool("escalate_to_human", { reason }, ctx);
  } catch (escalationError) {
    console.error("[agent] fallback escalation itself failed", escalationError);
  }
  await persistState(deps, ctx.conversationId, ctx.state);
  return [textReply(FALLBACK_REPLY_TEXT)];
}
