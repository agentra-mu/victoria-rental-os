import { listAllKnowledgeBase } from "@/lib/domain/knowledgeBase";
import {
  checkInternalSecret,
  getEngineDb,
  jsonError,
  jsonOk,
} from "../../_shared";

export async function GET(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const entries = await listAllKnowledgeBase(getEngineDb());
    return jsonOk({ entries });
  } catch (error) {
    return jsonError(error);
  }
}
