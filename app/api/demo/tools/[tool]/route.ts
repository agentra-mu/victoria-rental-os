import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/http";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import {
  DEMO_TOOL_NAMES,
  runDemoTool,
  type DemoToolName,
} from "@/lib/demo/tools";
import { guardDemoRoute } from "@/lib/demo/mode";
import { alertError } from "@/lib/monitoring/log";
import { getServiceSupabase } from "@/lib/supabase/server";

const envelope = z.object({ whatsapp_number: z.string().min(5).max(20) });

/**
 * POST /api/demo/tools/<tool> — body { whatsapp_number, ...tool args }.
 * n8n sets whatsapp_number as a FIXED value from the chat session; the model
 * only supplies the tool args. Always HTTP 200 for tool-level failures so n8n
 * hands { ok:false, error } back to the model to explain (401/404 stay HTTP errors).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  const blocked = guardDemoRoute(request);
  if (blocked) return blocked;

  const { tool } = await params;
  if (!DEMO_TOOL_NAMES.includes(tool as DemoToolName)) {
    return NextResponse.json({
      ok: false,
      error: { code: "UNKNOWN_TOOL", message: `No such tool: ${tool}` },
    });
  }

  try {
    const body = await readJsonBody(request);
    const { whatsapp_number } = envelope.parse(body);
    const client = getServiceSupabase();
    const result = await runDemoTool(
      {
        domainDb: createSupabaseDomainDb(client),
        messaging: createSupabaseMessagingDb(client),
      },
      whatsapp_number,
      tool as DemoToolName,
      body,
    );
    return NextResponse.json(result);
  } catch (error) {
    await alertError(`demo tool ${tool} failed`, error);
    return NextResponse.json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our side. Offer to connect a human.",
      },
    });
  }
}
