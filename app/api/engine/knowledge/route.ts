import { NextRequest } from "next/server";
import { z } from "zod";
import { searchKnowledgeBase } from "@/lib/domain/knowledgeBase";
import {
  checkInternalSecret,
  getEngineDb,
  jsonError,
  jsonOk,
} from "../_shared";

const querySchema = z.object({ q: z.string().min(1) });

export async function GET(request: NextRequest) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const { q } = querySchema.parse({
      q: request.nextUrl.searchParams.get("q"),
    });
    const entries = await searchKnowledgeBase(getEngineDb(), q);
    return jsonOk({ entries });
  } catch (error) {
    return jsonError(error);
  }
}
