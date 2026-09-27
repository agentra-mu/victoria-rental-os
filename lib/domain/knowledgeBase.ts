import type { DomainDb, KnowledgeBaseEntryRow } from "./ports";

const MAX_SEARCH_RESULTS = 5;

/** The AI retrieves answers rather than inventing them (CLAUDE.md) — at most 5 entries, best match first. */
export async function searchKnowledgeBase(
  db: DomainDb,
  query: string,
): Promise<KnowledgeBaseEntryRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return db.searchKnowledgeBase(trimmed, MAX_SEARCH_RESULTS);
}

/** The whole KB, compact enough to put directly in the AI's context for the trial. */
export async function listAllKnowledgeBase(
  db: DomainDb,
): Promise<KnowledgeBaseEntryRow[]> {
  return db.listActiveKnowledgeBase();
}
