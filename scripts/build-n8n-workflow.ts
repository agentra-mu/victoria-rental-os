/**
 * Builds n8n/demo-chatbot.json from n8n/system-prompt.md.
 * Run: npm run demo:n8n  (re-run after editing the prompt).
 *
 * Node parameter names follow n8n 1.x (Chat Trigger 1.1, AI Agent 1.7, HTTP
 * Request Tool 1.1, Google Gemini chat model 1). n8n changes these between
 * versions: see n8n/README.md "What to check after import".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const APP_URL_DEFAULT =
  process.env.APP_URL ?? "https://victoria-rental-os.vercel.app";
const ALLOWED_ORIGIN = process.env.DEMO_APP_ORIGIN ?? "*";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "models/gemini-2.5-flash";
const SECRET_CRED = {
  httpHeaderAuth: { id: "", name: "Victoria Internal Secret" },
};
const GEMINI_CRED = { googlePalmApi: { id: "", name: "Gemini Demo" } };

const NUMBER = "$('Config').first().json.whatsapp_number";
const APP = "$('Config').first().json.app_url";
const COMPANY = "$('Config').first().json.company_name";

const promptText = readFileSync(here("../n8n/system-prompt.md"), "utf8").trim();
if (promptText.includes("{{") && !promptText.includes("{{COMPANY}}")) {
  throw new Error(
    "system-prompt.md must not contain n8n expression braces except {{COMPANY}}",
  );
}

const sessionContext = `

## Session context (from the system, trusted)

Today in Mauritius: {{ $('Inbound').first().json.data.today }}
Customer name on file: {{ $('Inbound').first().json.data.customerName || 'not on file' }}
First message of this customer: {{ $('Inbound').first().json.data.isFirstContact }}
Customer summary: {{ $('Inbound').first().json.data.customerContext }}`;

const systemMessage =
  "=" +
  promptText.replaceAll("{{COMPANY}}", `{{ ${COMPANY} }}`) +
  sessionContext;

interface Tool {
  name: string;
  description: string;
  params: { name: string; description: string; type?: string }[];
  /** Body fields (besides the fixed whatsapp_number) in order. */
  body?: string[];
}

const TOOLS: Tool[] = [
  {
    name: "get_customer_context",
    description:
      "Who this customer is and their active booking (car, dates, status, price, documents). No input needed.",
    params: [],
  },
  {
    name: "get_fleet",
    description:
      "All cars with daily price in Rs, plus all locations with opening hours and fees. No input needed. Use for 'view cars' and location questions.",
    params: [],
  },
  {
    name: "check_availability",
    description:
      "Which cars are free between two date-times. Returns each model with price and a vehicle_id. Dates are Mauritius time like 2026-10-12T09:00.",
    params: [
      { name: "pickup_at", description: "Pickup, like 2026-10-12T09:00" },
      { name: "return_at", description: "Return, like 2026-10-15T09:00" },
      {
        name: "category",
        description: "Economy, Sedan or SUV. Empty string for all.",
      },
    ],
  },
  {
    name: "get_knowledge",
    description:
      "Look up company policy (payment, documents, fuel, mileage, cancellation, late returns, airport, delivery). Answer only from the result.",
    params: [
      { name: "query", description: "The customer's question in a few words" },
    ],
  },
  {
    name: "start_or_update_booking_draft",
    description:
      "Create or update the booking in progress. Send what you know; empty string for anything not known yet or unchanged. Locations by name, e.g. 'Grand Baie'.",
    params: [
      {
        name: "vehicle_id",
        description: "vehicle_id from check_availability, or empty string",
      },
      {
        name: "pickup_at",
        description: "like 2026-10-12T09:00, or empty string",
      },
      {
        name: "return_at",
        description: "like 2026-10-15T09:00, or empty string",
      },
      {
        name: "pickup_location",
        description: "Location name, or empty string",
      },
      {
        name: "dropoff_location",
        description: "Location name, or empty string",
      },
      {
        name: "customer_full_name",
        description: "Full name exactly as on passport/permit, or empty string",
      },
    ],
  },
  {
    name: "get_price_quote",
    description:
      "Price summary of the booking in progress. Always call before asking the customer to confirm. No input needed.",
    params: [],
  },
  {
    name: "confirm_booking",
    description:
      "Confirm the booking in progress. Only after the customer clearly said yes to the summary. No input needed.",
    params: [],
  },
  {
    name: "record_customer_update",
    description:
      "Record a delay, pickup time change or extension request for the team. It is NOT approved by this.",
    params: [
      {
        name: "type",
        description:
          "One of: DELAY, PICKUP_TIME_CHANGE, EXTENSION_REQUEST, OTHER",
      },
      {
        name: "details",
        description: "What the customer asked, with times and durations",
      },
    ],
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the chat to a person: complaints, accidents, payment trouble, out-of-policy requests, or the customer asks for a person.",
    params: [
      { name: "reason", description: "Short reason for the team" },
      {
        name: "type",
        description: "NEEDS_HUMAN, or CASH_ISSUE if they cannot pay in cash",
      },
    ],
  },
];

const toolNodes = TOOLS.map((t, i) => {
  const fields = [
    `"whatsapp_number": "{{ ${NUMBER} }}"`,
    ...t.params.map((p) => `"${p.name}": "{${p.name}}"`),
  ];
  return {
    parameters: {
      toolDescription: t.description,
      method: "POST",
      url: `={{ ${APP} }}/api/demo/tools/${t.name}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={\n  ${fields.join(",\n  ")}\n}`,
      ...(t.params.length
        ? {
            placeholderDefinitions: {
              values: t.params.map((p) => ({
                name: p.name,
                description: p.description,
                type: p.type ?? "string",
              })),
            },
          }
        : {}),
    },
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    typeVersion: 1.1,
    position: [1060 + (i % 3) * 200, 560 + Math.floor(i / 3) * 160] as [
      number,
      number,
    ],
    id: `tool-${t.name}`,
    name: t.name,
    credentials: SECRET_CRED,
  };
});

const connections: Record<string, unknown> = {
  "Chat Trigger": { main: [[{ node: "Config", type: "main", index: 0 }]] },
  Config: { main: [[{ node: "Inbound", type: "main", index: 0 }]] },
  Inbound: { main: [[{ node: "Skip AI?", type: "main", index: 0 }]] },
  "Skip AI?": {
    main: [
      [{ node: "Team reply", type: "main", index: 0 }],
      [{ node: "AI Agent", type: "main", index: 0 }],
    ],
  },
  "AI Agent": { main: [[{ node: "Prepare reply", type: "main", index: 0 }]] },
  "Prepare reply": {
    main: [[{ node: "Store reply", type: "main", index: 0 }]],
  },
  "Store reply": { main: [[{ node: "Reply", type: "main", index: 0 }]] },
  "Gemini chat model": {
    ai_languageModel: [
      [{ node: "AI Agent", type: "ai_languageModel", index: 0 }],
    ],
  },
  "Window memory": {
    ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]],
  },
};
for (const t of TOOLS) {
  connections[t.name] = {
    ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
  };
}

const cond = (left: string) => ({
  options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
  conditions: [
    {
      id: "skip-cond",
      leftValue: left,
      rightValue: "",
      operator: { type: "boolean", operation: "true", singleValue: true },
    },
  ],
  combinator: "and",
});

const workflow = {
  name: "Victoria demo chatbot",
  nodes: [
    {
      parameters: {
        public: true,
        authentication: "none",
        initialMessages: "",
        options: {
          allowedOrigins: ALLOWED_ORIGIN,
          responseMode: "lastNode",
          loadPreviousSession: "notSupported",
        },
      },
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      typeVersion: 1.1,
      position: [0, 300],
      id: "chat-trigger",
      name: "Chat Trigger",
      webhookId: "7b8f1c52-4c1e-4d0a-9d2b-5a3f6e1d9c01",
    },
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "a1",
              name: "app_url",
              value: APP_URL_DEFAULT,
              type: "string",
            },
            {
              id: "a2",
              name: "company_name",
              value: "Victoria Car Rental",
              type: "string",
            },
            {
              id: "a3",
              name: "whatsapp_number",
              value: "={{ $json.metadata?.whatsapp_number || '+23057000001' }}",
              type: "string",
            },
          ],
        },
        includeOtherFields: true,
        options: {},
      },
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [220, 300],
      id: "config",
      name: "Config",
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $json.app_url }}/api/demo/chat/inbound",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          '={{ { whatsapp_number: $json.whatsapp_number, text: $json.chatInput, message_id: "n8n-" + $execution.id } }}',
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [440, 300],
      id: "inbound",
      name: "Inbound",
      credentials: SECRET_CRED,
    },
    {
      parameters: {
        conditions: cond("={{ $json.data.skipAgent }}"),
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [660, 300],
      id: "skip-ai",
      name: "Skip AI?",
    },
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "t1",
              name: "output",
              value:
                "={{ $('Inbound').first().json.data.systemReply || 'A member of our team will get back to you shortly.' }}",
              type: "string",
            },
          ],
        },
        options: {},
      },
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [900, 160],
      id: "team-reply",
      name: "Team reply",
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $('Chat Trigger').first().json.chatInput }}",
        agent: "toolsAgent",
        options: { systemMessage, maxIterations: 8 },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 1.7,
      position: [900, 380],
      id: "ai-agent",
      name: "AI Agent",
      onError: "continueRegularOutput",
    },
    {
      parameters: {
        modelName: GEMINI_MODEL,
        options: { temperature: 0.2 },
      },
      type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      typeVersion: 1,
      position: [780, 620],
      id: "gemini",
      name: "Gemini chat model",
      credentials: GEMINI_CRED,
    },
    {
      parameters: {
        sessionIdType: "customKey",
        sessionKey: "={{ $('Chat Trigger').first().json.sessionId }}",
        contextWindowLength: 15,
      },
      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      typeVersion: 1.3,
      position: [940, 620],
      id: "memory",
      name: "Window memory",
    },
    ...toolNodes,
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "p1",
              name: "reply_text",
              value:
                "={{ $json.output || 'Sorry, I am having trouble right now. A member of our team will follow up shortly.' }}",
              type: "string",
            },
          ],
        },
        options: {},
      },
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [1500, 380],
      id: "prepare-reply",
      name: "Prepare reply",
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $('Config').first().json.app_url }}/api/demo/chat/outbound",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ { whatsapp_number: $('Config').first().json.whatsapp_number, text: $json.reply_text } }}",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1720, 380],
      id: "store-reply",
      name: "Store reply",
      credentials: SECRET_CRED,
      onError: "continueRegularOutput",
    },
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "r1",
              name: "output",
              value: "={{ $('Prepare reply').first().json.reply_text }}",
              type: "string",
            },
          ],
        },
        options: {},
      },
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [1940, 380],
      id: "reply",
      name: "Reply",
    },
  ],
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  pinData: {},
};

writeFileSync(
  here("../n8n/demo-chatbot.json"),
  JSON.stringify(workflow, null, 2) + "\n",
);
console.log(
  `Wrote n8n/demo-chatbot.json (${workflow.nodes.length} nodes, model ${GEMINI_MODEL}, app ${APP_URL_DEFAULT}).`,
);
