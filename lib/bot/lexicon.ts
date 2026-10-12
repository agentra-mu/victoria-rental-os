import { containsPhrase, normalize, tokens } from "./text";
import type { Lang } from "./types";

/**
 * All keyword lists live here, per language, so extending the bot is a data
 * edit. Everything is matched case- and accent-insensitively (see text.ts) —
 * write entries in plain lower-case; accents are optional.
 */
type PerLang = Record<Lang, string[]>;

export const COMMANDS = {
  human: {
    en: [
      "human",
      "agent",
      "talk to someone",
      "talk to a person",
      "talk to a human",
      "speak to someone",
      "speak to a person",
      "speak to a human",
      "real person",
      "customer service",
    ],
    fr: [
      "humain",
      "agent",
      "conseiller",
      "parler a quelqu'un",
      "parler a une personne",
      "parler a un humain",
      "parler a un agent",
      "une vraie personne",
      "service client",
    ],
  },
  menu: {
    en: ["menu", "main menu", "start over", "restart", "home"],
    fr: ["menu", "menu principal", "recommencer", "accueil"],
  },
  cancel: {
    en: [
      "cancel",
      "cancel booking",
      "cancel my booking",
      "never mind",
      "abort",
    ],
    fr: ["annuler", "annule", "annuler la reservation", "laisse tomber"],
  },
  stop: { en: ["stop", "unsubscribe"], fr: ["stop", "arreter"] },
  start: { en: ["start"], fr: ["demarrer"] },
  back: {
    en: ["back", "go back", "previous", "return"],
    fr: ["retour", "revenir", "precedent", "en arriere"],
  },
  change: {
    en: ["change", "edit", "modify", "change details"],
    fr: ["changer", "modifier", "change", "modifier les details"],
  },
  yes: {
    en: [
      "yes",
      "y",
      "yeah",
      "yep",
      "ok",
      "okay",
      "sure",
      "confirm",
      "confirmed",
      "correct",
      "that's right",
      "go ahead",
    ],
    fr: [
      "oui",
      "ouais",
      "d'accord",
      "daccord",
      "confirme",
      "confirmer",
      "correct",
      "c'est bon",
      "ok",
    ],
  },
  no: {
    en: ["no", "n", "nope", "nah"],
    fr: ["non", "nan"],
  },
  thanks: {
    en: [
      "thanks",
      "thank you",
      "thanks a lot",
      "great thanks",
      "perfect",
      "cheers",
    ],
    fr: ["merci", "merci beaucoup", "parfait", "super merci"],
  },
  greeting: {
    en: [
      "hi",
      "hello",
      "hey",
      "good morning",
      "good afternoon",
      "good evening",
      "hiya",
    ],
    fr: ["bonjour", "salut", "bonsoir", "coucou", "allo"],
  },
} satisfies Record<string, PerLang>;

export type CommandName = keyof typeof COMMANDS;

/** Commands whose single word may appear inside a short sentence ("I need an agent"). */
const LOOSE_COMMANDS = new Set<CommandName>(["human"]);
const LOOSE_MAX_TOKENS = 10;
const PHRASE_MAX_TOKENS = 9;

/**
 * Matches `text` against the command lists. A command matches when the whole
 * (normalised) message equals a keyword, or — for multi-word keywords, and
 * for HUMAN — when the keyword appears inside a short message.
 */
export function matchCommand(
  text: string,
): { name: CommandName; lang: Lang } | null {
  const n = normalize(text);
  if (!n) return null;
  const count = tokens(n).length;
  for (const name of Object.keys(COMMANDS) as CommandName[]) {
    for (const lang of ["en", "fr"] as Lang[]) {
      for (const kw of COMMANDS[name][lang]) {
        const k = normalize(kw);
        if (n === k) return { name, lang };
        const multiWord = k.includes(" ");
        if (
          (multiWord && count <= PHRASE_MAX_TOKENS && containsPhrase(n, k)) ||
          (LOOSE_COMMANDS.has(name) &&
            count <= LOOSE_MAX_TOKENS &&
            containsPhrase(n, k))
        ) {
          return { name, lang };
        }
      }
    }
  }
  return null;
}

/** Booking-related intents recognised from free text (keyword rules, no LLM). */
export const INTENTS = {
  view_cars: {
    en: [
      "view cars",
      "see cars",
      "show cars",
      "cars",
      "car list",
      "fleet",
      "rent a car",
      "hire a car",
      "i want to rent",
      "i would like to rent",
      "prices",
      "price list",
      "how much",
    ],
    fr: [
      "voir les voitures",
      "voitures",
      "voiture",
      "flotte",
      "louer une voiture",
      "je veux louer",
      "je voudrais louer",
      "prix",
      "tarifs",
      "combien",
    ],
  },
  check_availability: {
    en: ["availability", "available", "check availability", "is there a car"],
    fr: [
      "disponibilite",
      "disponibilites",
      "disponible",
      "verifier la disponibilite",
    ],
  },
  existing_booking: {
    en: [
      "my booking",
      "booking status",
      "my reservation",
      "existing booking",
      "booking number",
    ],
    fr: [
      "ma reservation",
      "ma location",
      "statut de ma reservation",
      "reservation existante",
      "numero de reservation",
    ],
  },
  delay: {
    en: [
      "late",
      "running late",
      "delay",
      "delayed",
      "will be late",
      "return late",
    ],
    fr: [
      "retard",
      "en retard",
      "retarde",
      "je serai en retard",
      "rendre plus tard",
    ],
  },
  extension: {
    en: ["extend", "extension", "keep the car longer", "more days", "longer"],
    fr: [
      "prolonger",
      "prolongation",
      "rallonger",
      "garder la voiture plus longtemps",
      "jours de plus",
      "plus longtemps",
    ],
  },
  pickup_change: {
    en: [
      "change pickup",
      "pickup time",
      "pick up time",
      "change the pickup",
      "collect earlier",
      "collect later",
    ],
    fr: [
      "changer la prise",
      "heure de prise",
      "heure de retrait",
      "changer l'heure",
      "recuperer plus tot",
      "recuperer plus tard",
    ],
  },
  upload_link: {
    en: [
      "upload link",
      "send the link",
      "send me the link",
      "link again",
      "documents link",
      "upload my documents",
      "where do i upload",
    ],
    fr: [
      "lien de telechargement",
      "envoyez le lien",
      "renvoyez le lien",
      "lien des documents",
      "lien pour les documents",
      "ou envoyer mes documents",
    ],
  },
  incident: {
    en: [
      "accident",
      "crash",
      "crashed",
      "damage",
      "damaged",
      "dent",
      "scratch",
      "broke down",
      "broken down",
      "breakdown",
      "stolen",
      "police",
      "complaint",
      "flat tyre",
      "flat tire",
    ],
    fr: [
      "accident",
      "accroche",
      "degat",
      "degats",
      "endommage",
      "rayure",
      "panne",
      "vole",
      "vol",
      "police",
      "plainte",
      "reclamation",
      "crevaison",
    ],
  },
  cash_issue: {
    en: [
      "can't pay cash",
      "cannot pay cash",
      "cant pay cash",
      "no cash",
      "don't have cash",
      "dont have cash",
      "pay by card instead",
    ],
    fr: [
      "pas d'especes",
      "je ne peux pas payer en especes",
      "pas de cash",
      "sans especes",
    ],
  },
  payment_claim: {
    en: [
      "i paid",
      "i have paid",
      "already paid",
      "have paid",
      "payment sent",
      "paid already",
      "i've paid",
      "ive paid",
      "transferred the money",
      "sent the money",
    ],
    fr: [
      "j'ai paye",
      "deja paye",
      "j'ai deja paye",
      "paiement effectue",
      "j'ai vire",
      "j'ai envoye l'argent",
      "virement effectue",
    ],
  },
} satisfies Record<string, PerLang>;

export type IntentKey = keyof typeof INTENTS;
export const INTENT_KEYS = Object.keys(INTENTS) as IntentKey[];

/** Longest matching keyword wins; ties go to the first intent listed. */
export function matchIntent(text: string): IntentKey | null {
  const n = normalize(text);
  if (!n) return null;
  let best: { key: IntentKey; len: number } | null = null;
  for (const key of INTENT_KEYS) {
    for (const lang of ["en", "fr"] as Lang[]) {
      for (const kw of INTENTS[key][lang]) {
        const k = normalize(kw);
        if (containsPhrase(n, k) && (!best || k.length > best.len)) {
          best = { key, len: k.length };
        }
      }
    }
  }
  return best?.key ?? null;
}

/**
 * Built-in FAQ intent keys and their trigger phrases. A knowledge_base row
 * with a matching `intent_key` is the answer; the owner edits the text, not
 * these triggers (rows can add their own `keywords` too).
 */
export const FAQ_INTENTS = {
  opening_hours: {
    en: [
      "opening hours",
      "opening time",
      "what time do you open",
      "what time do you close",
      "are you open",
      "hours of operation",
      "business hours",
    ],
    fr: [
      "heures d'ouverture",
      "horaires",
      "a quelle heure ouvrez",
      "a quelle heure fermez",
      "etes vous ouverts",
      "etes-vous ouvert",
    ],
  },
  payment_methods: {
    en: [
      "credit card",
      "debit card",
      "visa",
      "mastercard",
      "pay by card",
      "card payment",
      "bank transfer",
      "paypal",
      "payment method",
      "payment methods",
      "how do i pay",
      "how can i pay",
      "can i pay",
      "do you accept cash",
      "do you accept card",
      "pay cash",
    ],
    fr: [
      "carte bancaire",
      "carte de credit",
      "paiement par carte",
      "virement",
      "moyens de paiement",
      "mode de paiement",
      "comment payer",
      "puis-je payer",
      "payer en especes",
      "acceptez-vous",
    ],
  },
  documents_required: {
    en: [
      "documents required",
      "what documents",
      "which documents",
      "what do i need",
      "need to rent",
      "driving licence",
      "driving license",
      "driver's license",
      "passport",
      "id card",
    ],
    fr: [
      "documents necessaires",
      "quels documents",
      "que faut-il",
      "permis de conduire",
      "passeport",
      "carte d'identite",
      "pieces necessaires",
    ],
  },
  fuel: {
    en: ["fuel", "petrol", "diesel", "tank", "refuel"],
    fr: ["carburant", "essence", "reservoir", "plein"],
  },
  mileage: {
    en: [
      "mileage",
      "kilometres",
      "kilometers",
      "km limit",
      "unlimited km",
      "how far can i drive",
    ],
    fr: ["kilometrage", "kilometres", "limite de km", "km illimite"],
  },
  cancellation: {
    en: [
      "cancellation policy",
      "cancellation",
      "refund",
      "can i cancel",
      "cancel policy",
    ],
    fr: [
      "politique d'annulation",
      "conditions d'annulation",
      "remboursement",
      "puis-je annuler",
    ],
  },
  late_return: {
    en: [
      "late return",
      "return the car late",
      "late fee",
      "late charge",
      "grace period",
    ],
    fr: [
      "retour tardif",
      "frais de retard",
      "rendre la voiture en retard",
      "penalite de retard",
    ],
  },
  deposit: {
    en: ["deposit", "security deposit", "excess", "insurance"],
    fr: ["caution", "depot de garantie", "franchise", "assurance"],
  },
  address: {
    en: [
      "address",
      "where are you",
      "where are you located",
      "directions",
      "how do i get to",
      "location of your office",
      "where is your office",
    ],
    fr: [
      "adresse",
      "ou etes-vous",
      "ou etes vous",
      "itineraire",
      "ou se trouve",
      "comment venir",
    ],
  },
} satisfies Record<string, PerLang>;

export type FaqIntentKey = keyof typeof FAQ_INTENTS;

export function matchFaqIntent(text: string): FaqIntentKey | null {
  const n = normalize(text);
  if (!n) return null;
  let best: { key: FaqIntentKey; len: number } | null = null;
  for (const key of Object.keys(FAQ_INTENTS) as FaqIntentKey[]) {
    for (const lang of ["en", "fr"] as Lang[]) {
      for (const kw of FAQ_INTENTS[key][lang]) {
        const k = normalize(kw);
        if (containsPhrase(n, k) && (!best || k.length > best.len)) {
          best = { key, len: k.length };
        }
      }
    }
  }
  return best?.key ?? null;
}

/** Words that mark a message as a question (gates the FTS/LLM knowledge lookups mid-flow). */
export const QUESTION_WORDS: PerLang = {
  en: [
    "what",
    "when",
    "where",
    "how",
    "why",
    "which",
    "who",
    "can",
    "could",
    "do",
    "does",
    "is",
    "are",
    "will",
    "would",
    "may",
  ],
  fr: [
    "quoi",
    "quand",
    "ou",
    "comment",
    "pourquoi",
    "quel",
    "quelle",
    "quels",
    "quelles",
    "qui",
    "puis",
    "peut",
    "est",
    "est-ce",
    "combien",
    "avez",
    "faut",
  ],
};

export function looksLikeQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  const first = tokens(text)[0];
  if (!first) return false;
  return [...QUESTION_WORDS.en, ...QUESTION_WORDS.fr].some(
    (w) => normalize(w) === first,
  );
}

/** Month/day words for the date parser (chrono covers EN/FR; extend here for new languages). */
export const DATE_WORDS = {
  today: {
    en: ["today", "tonight"],
    fr: ["aujourd'hui", "aujourdhui", "ce soir"],
  },
  tomorrow: { en: ["tomorrow"], fr: ["demain"] },
  dayAfterTomorrow: {
    en: ["day after tomorrow"],
    fr: ["apres-demain", "apres demain"],
  },
  noon: { en: ["noon", "midday"], fr: ["midi"] },
} satisfies Record<string, PerLang>;

/** Words used by the language detector. Overlapping/ambiguous words are left out on purpose. */
export const LANG_WORDS: Record<Lang, string[]> = {
  en: [
    "the",
    "and",
    "you",
    "your",
    "please",
    "thanks",
    "thank",
    "want",
    "would",
    "like",
    "need",
    "rent",
    "car",
    "cars",
    "booking",
    "tomorrow",
    "next",
    "from",
    "to",
    "my",
    "name",
    "is",
    "what",
    "how",
    "do",
    "can",
    "hello",
    "hi",
    "yes",
    "no",
    "hours",
    "open",
    "pay",
    "card",
    "cash",
    "late",
    "extend",
    "pickup",
    "return",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "october",
    "november",
    "december",
    "january",
    "february",
    "march",
    "april",
    "june",
    "july",
    "august",
    "september",
  ],
  fr: [
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "je",
    "tu",
    "vous",
    "votre",
    "merci",
    "svp",
    "voudrais",
    "veux",
    "souhaite",
    "besoin",
    "louer",
    "voiture",
    "voitures",
    "reservation",
    "demain",
    "prochain",
    "prochaine",
    "de",
    "du",
    "au",
    "mon",
    "ma",
    "mes",
    "nom",
    "est",
    "quoi",
    "comment",
    "quel",
    "quelle",
    "bonjour",
    "salut",
    "bonsoir",
    "oui",
    "non",
    "heures",
    "ouvert",
    "payer",
    "carte",
    "especes",
    "retard",
    "prolonger",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
    "octobre",
    "novembre",
    "decembre",
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "pour",
    "avec",
    "et",
    "j'ai",
    "m'appelle",
  ],
};

/** Words that must never pass as a person's name (prompt-injection / sentence guard). */
export const NAME_BLOCKLIST: string[] = [
  "ignore",
  "instructions",
  "instruction",
  "discount",
  "prompt",
  "system",
  "free",
  "rs",
  "price",
  "pay",
  "paid",
  "booking",
  "car",
  "rent",
  "please",
  "ignorez",
  "reduction",
  "gratuit",
  "prix",
  "payer",
  "reservation",
  "voiture",
  "louer",
  "hello",
  "hi",
  "bonjour",
  "yes",
  "no",
  "oui",
  "non",
  "what",
  "how",
  "when",
  "where",
  "the",
  "give",
  "donne",
  "donnez",
];

/** Leading phrases stripped before a name is validated ("my name is Jean Baptiste"). */
export const NAME_PREFIXES: string[] = [
  "my name is",
  "my full name is",
  "i am",
  "i'm",
  "name is",
  "it's",
  "its",
  "this is",
  "je m'appelle",
  "je suis",
  "mon nom est",
  "mon nom complet est",
  "c'est",
];

export const NAME_SUFFIX_PATTERNS: RegExp[] = [
  /,?\s*(exactly )?as (on|in) my (passport|licen[cs]e|permit|id).*$/i,
  /,?\s*(exactement )?comme sur mon (passeport|permis|id).*$/i,
  /,?\s*(please|svp|merci|thanks)\s*$/i,
];

/** "Same place" answers at the drop-off step (matched on the whole normalised message). */
export const SAME_LOCATION: string[] = [
  "same",
  "same place",
  "same location",
  "same as pickup",
  "same as pick up",
  "same as above",
  "idem",
  "pareil",
  "meme lieu",
  "meme endroit",
  "le meme",
  "au meme endroit",
];
