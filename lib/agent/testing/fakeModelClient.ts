import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "../ports";

type Message = Anthropic.Messages.Message;

function usage(inputTokens = 10, outputTokens = 10): Message["usage"] {
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    server_tool_use: null,
    service_tier: null,
    inference_geo: null,
  } as Message["usage"];
}

export function textMessage(text: string): Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_details: null,
    stop_sequence: null,
    container: null,
    usage: usage(),
  } as Message;
}

export function toolUseMessage(
  calls: { id: string; name: string; input: unknown }[],
): Message {
  return {
    id: "msg_fake_tool",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: calls.map((call) => ({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.input,
      caller: { type: "direct" },
    })),
    stop_reason: "tool_use",
    stop_details: null,
    stop_sequence: null,
    container: null,
    usage: usage(),
  } as Message;
}

/** Scripted ModelClient: returns each queued response in order, one per createMessage call. */
export function createScriptedModelClient(responses: Message[]): ModelClient {
  const queue = [...responses];
  return {
    async createMessage() {
      const next = queue.shift();
      if (!next)
        throw new Error(
          "createScriptedModelClient: ran out of scripted responses",
        );
      return next;
    },
  };
}

/**
 * Like createScriptedModelClient, but each response is computed from the
 * running message history — needed when a later tool call must reuse an id
 * returned by an earlier one (e.g. get_price_quote needs the bookingId
 * start_or_update_booking_draft just created), which a fixed response list
 * can't express.
 */
export function createReactiveModelClient(
  handler: (
    messages: Anthropic.Messages.MessageParam[],
    callIndex: number,
  ) => Message,
): ModelClient {
  let callIndex = 0;
  return {
    async createMessage(params) {
      const response = handler(params.messages, callIndex);
      callIndex += 1;
      return response;
    },
  };
}

/** Pulls the `data` payload out of the most recent tool_result in the message history. */
export function lastToolResultData(
  messages: Anthropic.Messages.MessageParam[],
): Record<string, unknown> {
  const last = messages[messages.length - 1];
  if (!last || typeof last.content === "string" || last.role !== "user") {
    throw new Error("lastToolResultData: no tool_result at the end of history");
  }
  const toolResult = last.content.find(
    (block): block is Anthropic.Messages.ToolResultBlockParam =>
      block.type === "tool_result",
  );
  if (!toolResult || typeof toolResult.content !== "string") {
    throw new Error(
      "lastToolResultData: tool_result content wasn't a JSON string",
    );
  }
  const parsed = JSON.parse(toolResult.content) as {
    ok: boolean;
    data?: unknown;
  };
  if (!parsed.ok || !parsed.data)
    throw new Error("lastToolResultData: tool call did not succeed");
  return parsed.data as Record<string, unknown>;
}
