import type { Lang } from "../types";
import { en } from "./en";
import { fr } from "./fr";
import type { Templates } from "./types";

const BY_LANG: Record<Lang, Templates> = { en, fr };

export function getTemplates(lang: Lang): Templates {
  return BY_LANG[lang] ?? en;
}

export type { Templates } from "./types";
export type { StatusCardData, SummaryData, ChangeSummary } from "./types";
