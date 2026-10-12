/**
 * Bot-facing extras for the demo data: FAQ intent keys, trigger keywords, French text and location
 * aliases. Mirrors the data block of migration 20261012100000_deterministic_bot.sql (which does the
 * same for the plain seed.sql data). French wording is unreviewed — see NEEDS_NATIVE_REVIEW.md.
 */
export interface KbExtras {
  intent_key: string | null;
  keywords: string[];
  question_fr: string | null;
  answer_fr: string | null;
}

export const KB_EXTRAS: Record<string, KbExtras> = {
  "What are your opening hours?": {
    intent_key: "opening_hours",
    keywords: ["opening hours", "horaires"],
    question_fr: "Quels sont vos horaires d'ouverture ?",
    answer_fr:
      "La plupart de nos agences sont ouvertes de 08h00 à 18h00 du lundi au vendredi, avec des horaires réduits le samedi (Quatre Bornes et Port Louis ferment à 17h00 en semaine). La plupart sont fermées le dimanche, sauf Flic-en-Flac (08h00-13h00) et le comptoir de l'aéroport (06h00-22h00, tous les jours).",
  },
  "How do I pay?": {
    intent_key: "payment_methods",
    keywords: ["how do i pay", "comment payer"],
    question_fr: "Comment payer ?",
    answer_fr:
      "Le paiement se fait uniquement en espèces, en roupies mauriciennes (Rs), à la remise de la voiture. Nous n'acceptons ni carte, ni virement, ni acompte à l'avance.",
  },
  "Can I pay by card or bank transfer?": {
    intent_key: "payment_methods",
    keywords: ["pay by card", "bank transfer", "credit card", "carte bancaire"],
    question_fr: "Puis-je payer par carte ou virement ?",
    answer_fr:
      "Non — nous sommes uniquement en espèces, payées à la prise en charge. Si c'est difficile pour vous, écrivez-nous et un membre de l'équipe vous aidera.",
  },
  "What do I need to rent a car?": {
    intent_key: "documents_required",
    keywords: ["what do i need", "documents required", "quels documents"],
    question_fr: "De quoi ai-je besoin pour louer une voiture ?",
    answer_fr:
      "Un passeport ou une carte d'identité valide, un permis de conduire détenu depuis au moins 1 an, et avoir 21 ans ou plus. Après la réservation, vous envoyez des photos de vos documents via un lien sécurisé.",
  },
  "Can I rent if I'm under 21?": {
    intent_key: null,
    keywords: ["under 21", "moins de 21 ans"],
    question_fr: "Puis-je louer si j'ai moins de 21 ans ?",
    answer_fr:
      "Notre âge minimum standard est de 21 ans. Si vous êtes plus jeune, dites-le-nous et l'équipe verra ce qui est possible.",
  },
  "What is the fuel policy?": {
    intent_key: "fuel",
    keywords: ["fuel policy"],
    question_fr: "Quelle est la politique carburant ?",
    answer_fr:
      "Les voitures sont remises avec le plein et doivent être rendues pleines. Sinon, des frais de ravitaillement s'appliquent.",
  },
  "Is there a mileage limit?": {
    intent_key: "mileage",
    keywords: ["mileage limit", "unlimited mileage"],
    question_fr: "Y a-t-il une limite de kilométrage ?",
    answer_fr: "Non. Le kilométrage sur l'île est illimité.",
  },
  "What is your cancellation policy?": {
    intent_key: "cancellation",
    keywords: ["cancellation policy"],
    question_fr: "Quelle est votre politique d'annulation ?",
    answer_fr:
      "Annulation gratuite jusqu'à 24 heures avant la prise en charge. Les annulations plus tardives ou les absences peuvent être facturées — renseignez-vous pour votre réservation.",
  },
  "What happens if I return the car late?": {
    intent_key: "late_return",
    keywords: ["return late", "late fee"],
    question_fr: "Que se passe-t-il si je rends la voiture en retard ?",
    answer_fr:
      "Un délai de grâce de 60 minutes s'applique. Ensuite, des frais de retard sont facturés. Si vous savez que vous serez en retard, prévenez-nous le plus tôt possible — nous enregistrons votre demande et l'équipe vous répondra.",
  },
  "Why do you need my passport and driving permit?": {
    intent_key: null,
    keywords: ["why passport"],
    question_fr:
      "Pourquoi avez-vous besoin de mon passeport et de mon permis ?",
    answer_fr:
      "La réglementation mauricienne nous oblige à vérifier l'identité et le permis de conduire de chaque locataire. Les documents sont stockés de manière sécurisée et utilisés uniquement à cette fin.",
  },
  "Is my document upload secure?": {
    intent_key: null,
    keywords: ["upload secure"],
    question_fr: "Mon envoi de documents est-il sécurisé ?",
    answer_fr:
      "Oui. L'envoi passe par un lien privé lié à votre réservation et les documents sont conservés dans un espace privé que seul le personnel autorisé peut ouvrir.",
  },
  "Do you offer child seats?": {
    intent_key: null,
    keywords: ["child seat", "baby seat", "siège enfant"],
    question_fr: "Proposez-vous des sièges enfant ?",
    answer_fr:
      "Oui, sur demande — dites-le-nous lors de la réservation et nous en réserverons un.",
  },
  "Can I add a second driver?": {
    intent_key: null,
    keywords: [
      "additional driver",
      "second driver",
      "conducteur supplémentaire",
    ],
    question_fr: "Puis-je ajouter un deuxième conducteur ?",
    answer_fr:
      "Oui. Le conducteur supplémentaire doit aussi fournir un permis de conduire valide pour vérification.",
  },
  "Is insurance included?": {
    intent_key: "deposit",
    keywords: ["insurance"],
    question_fr: "L'assurance est-elle incluse ?",
    answer_fr:
      "Une assurance de base est incluse dans chaque location. Renseignez-vous auprès de l'équipe sur le montant de la franchise et les options de couverture.",
  },
  "What if the car breaks down?": {
    intent_key: null,
    keywords: ["break down", "breaks down"],
    question_fr: "Que faire si la voiture tombe en panne ?",
    answer_fr:
      "Contactez-nous immédiatement dans ce chat ou au numéro de votre confirmation de réservation et nous organiserons une assistance ou un remplacement.",
  },
  "Can I pick up at the airport?": {
    intent_key: "address",
    keywords: [
      "pick up at the airport",
      "airport pickup",
      "récupérer à l'aéroport",
    ],
    question_fr: "Puis-je récupérer la voiture à l'aéroport ?",
    answer_fr:
      "Oui. Notre agent vous retrouve au comptoir de location dans le hall des arrivées, après la douane. Le comptoir est ouvert de 06h00 à 22h00 tous les jours. Des frais d'aéroport de Rs 500 s'appliquent.",
  },
  "Can I collect the car after hours, for a late flight?": {
    intent_key: null,
    keywords: ["after hours", "late flight", "hors horaires"],
    question_fr:
      "Puis-je récupérer la voiture hors horaires, pour un vol tardif ?",
    answer_fr:
      "À l'aéroport, oui — un supplément hors horaires de Rs 300 s'applique. Les autres agences ne proposent pas de prise en charge hors horaires.",
  },
  "Is there a minimum rental period?": {
    intent_key: null,
    keywords: ["minimum rental", "location minimale"],
    question_fr: "Y a-t-il une durée de location minimale ?",
    answer_fr: "La location minimale est de 1 jour (24 heures).",
  },
  "Can I drop the car at a different location?": {
    intent_key: null,
    keywords: ["different location", "drop off elsewhere", "autre lieu"],
    question_fr: "Puis-je rendre la voiture dans un autre lieu ?",
    answer_fr:
      "Oui, les lieux de prise en charge et de restitution peuvent différer. Les frais de chaque lieu, le cas échéant, sont inclus dans votre devis.",
  },
  "Can I extend my rental?": {
    intent_key: null,
    keywords: ["extend rental", "prolonger la location"],
    question_fr: "Puis-je prolonger ma location ?",
    answer_fr:
      "Oui, selon la disponibilité. Écrivez-nous le plus tôt possible : nous enregistrons votre demande et l'équipe confirme si la prolongation est possible et son coût.",
  },
};

export const LOCATION_ALIASES: Record<string, string[]> = {
  "SSR International Airport": [
    "airport",
    "SSR",
    "aeroport",
    "aéroport",
    "plaisance",
  ],
  "Grand Baie": ["grand bay", "grandbaie", "grand-baie"],
  "Port Louis": ["portlouis", "port-louis", "capital", "caudan"],
  "Flic-en-Flac": ["flic en flac", "flic", "fef"],
  "Quatre Bornes": ["quatre-bornes", "q bornes", "qb"],
  Tamarin: ["tamarin bay"],
};
