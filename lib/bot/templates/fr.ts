import { formatMauritiusDateTime, formatPriceRs } from "@/lib/whatsapp/format";
import { buttonsReply, listReply, textReply } from "@/lib/whatsapp/replies";
import { COMPANY_NAME } from "../config";
import { IDS, bookingPickId, carId, locId } from "../ids";
import type { CarOption } from "../parsers/car";
import { timeLabel } from "../parsers/localTime";
import type { ChangeKind } from "../types";
import type { StatusCardData, Templates } from "./types";

// NEEDS_NATIVE_REVIEW: every customer-facing string in this file is a best-effort
// French translation and must be proofread by a native speaker (see NEEDS_NATIVE_REVIEW.md).

const dt = (v: string) => formatMauritiusDateTime(v, "fr-FR");
const price = (n: number) => formatPriceRs(n);

const MENU_ROWS = [
  { id: IDS.menu.viewCars, title: "Voir les voitures" },
  { id: IDS.menu.checkAvailability, title: "Disponibilités" },
  { id: IDS.menu.existingBooking, title: "Ma réservation" },
  { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
];

const carRows = (cars: CarOption[]) =>
  cars.map((c) => {
    const extra = [c.transmission, c.seats ? `${c.seats} places` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      id: carId(c.id),
      title: `${c.make} ${c.model}`,
      description: `${price(c.dailyPriceRs)}/jour${extra ? ` · ${extra}` : ""}`,
    };
  });

const locRows = (locs: { id: string; name: string }[]) =>
  locs.map((l) => ({ id: locId(l.id), title: l.name }));

const navButtons = [
  { id: IDS.nav.back, title: "Retour" },
  { id: IDS.menu.main, title: "Menu principal" },
  { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
];

const STATUS: Record<string, string> = {
  ENQUIRY: "Demande",
  CAR_SELECTED: "Voiture choisie",
  DATES_SELECTED: "Dates choisies",
  PENDING_DOCUMENTS: "En attente de vos documents",
  DOCUMENTS_VERIFIED: "Documents vérifiés",
  CONFIRMED: "Confirmée",
  PICKED_UP: "Voiture récupérée",
  RETURNED: "Voiture rendue",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  NEEDS_HUMAN: "Prise en charge par notre équipe",
};
const DOCS: Record<string, string> = {
  NOT_SUBMITTED: "pas encore reçus",
  PENDING: "reçus, en attente de vérification",
  NEEDS_REVIEW: "en cours de vérification par notre équipe",
  VERIFIED: "vérifiés",
  REJECTED: "notre équipe vous contactera à ce sujet",
};
const PAYMENT: Record<string, string> = {
  UNPAID: "en espèces à la remise des clés",
  PAID: "enregistré comme payé par notre équipe",
  REFUNDED: "remboursé",
};

/** The domain builds price-line labels in English; translate the known shapes. */
function frLabel(label: string): string {
  return label
    .replace(/^(\d+) days? × /, (_, n) => `${n} jour${n === "1" ? "" : "s"} × `)
    .replace(/^Pickup fee — /, "Frais de prise en charge — ")
    .replace(/^Drop-off fee — /, "Frais de restitution — ")
    .replace(
      /^After-hours pickup fee — /,
      "Supplément hors horaires (prise en charge) — ",
    )
    .replace(
      /^After-hours return fee — /,
      "Supplément hors horaires (retour) — ",
    )
    .replace(/^Extras$/, "Suppléments");
}

function card(d: StatusCardData): string {
  const lines = [
    `*Réservation n°${d.bookingNumber}* — ${STATUS[d.status] ?? d.status}`,
    d.carName ? `🚗 ${d.carName}` : null,
    d.pickupAt && d.returnAt
      ? `📅 ${dt(d.pickupAt)} → ${dt(d.returnAt)}`
      : null,
    d.pickupLocation ? `📍 Prise en charge : ${d.pickupLocation}` : null,
    d.dropoffLocation && d.dropoffLocation !== d.pickupLocation
      ? `📍 Restitution : ${d.dropoffLocation}`
      : null,
    d.totalRs !== null ? `💰 Total : ${price(d.totalRs)}` : null,
    `Paiement : ${PAYMENT[d.paymentStatus] ?? d.paymentStatus}`,
    `Documents : ${DOCS[d.documentStatus] ?? d.documentStatus}`,
  ];
  return lines.filter(Boolean).join("\n");
}

const CHANGE_LABEL: Record<ChangeKind, string> = {
  RETURN_DELAY: "retard au retour",
  EXTENSION: "prolongation",
  PICKUP_TIME_CHANGE: "changement d'heure de prise en charge",
  CANCELLATION: "annulation",
};

export const fr: Templates = {
  menu: () =>
    listReply(
      `Bienvenue chez ${COMPANY_NAME} ! Comment pouvons-nous vous aider ?`,
      "Menu",
      MENU_ROWS,
    ),
  unknown: () =>
    listReply(
      "Désolé, je n'ai pas compris. Que souhaitez-vous faire ?",
      "Menu",
      MENU_ROWS,
    ),
  stuck: () =>
    buttonsReply(
      "J'ai du mal à comprendre. Vous pouvez revenir en arrière, recommencer depuis le menu ou parler à quelqu'un de notre équipe.",
      navButtons,
    ),
  humanHandoff: () =>
    textReply("Merci — un membre de notre équipe vous répondra très bientôt."),
  humanAlreadyNotified: () =>
    textReply(
      "Notre équipe a bien reçu votre demande et vous répondra ici dès que possible.",
    ),
  optedOut: () =>
    textReply(
      "Vous ne recevrez plus de rappels. Répondez START pour les réactiver.",
    ),
  optedIn: () => textReply("Les rappels sont réactivés. Merci !"),
  draftCancelled: () =>
    buttonsReply(
      "Pas de problème — j'ai annulé cette demande de réservation. Autre chose ?",
      [
        { id: IDS.menu.main, title: "Menu principal" },
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      ],
    ),
  nothingToCancel: () =>
    buttonsReply(
      "Aucune demande de réservation en cours à annuler. Pour annuler une réservation confirmée, ouvrez Ma réservation.",
      [
        { id: IDS.menu.existingBooking, title: "Ma réservation" },
        { id: IDS.menu.main, title: "Menu principal" },
      ],
    ),
  mediaNotAccepted: (url) =>
    textReply(
      url
        ? `Pour votre sécurité, envoyez vos documents uniquement via votre lien privé :\n${url}`
        : "Merci ! Utilisez les boutons ou écrivez-moi votre message, je vous aiderai.",
    ),
  genericError: () =>
    buttonsReply(
      "Désolé, un problème est survenu de notre côté. Vous pouvez réessayer ou parler à quelqu'un de notre équipe.",
      [
        { id: IDS.menu.main, title: "Menu principal" },
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      ],
    ),

  carList: (cars, mode) =>
    listReply(
      mode === "available"
        ? "Ces voitures sont disponibles pour vos dates. Laquelle souhaitez-vous ?"
        : "Voici nos voitures. Laquelle souhaitez-vous ?",
      "Voir les voitures",
      carRows(cars),
    ),
  carNotUnderstood: (cars) =>
    listReply(
      "Je n'ai pas trouvé cette voiture. Choisissez-en une dans la liste.",
      "Voir les voitures",
      carRows(cars),
    ),
  carAmbiguous: (cars) =>
    listReply(
      "Laquelle voulez-vous dire ?",
      "Voir les voitures",
      carRows(cars),
    ),
  carSelected: (car) =>
    `Excellent choix — la ${car.make} ${car.model}, ${price(car.dailyPriceRs)}/jour.`,

  askPickupDateTime: () =>
    textReply(
      "Quand souhaitez-vous récupérer la voiture ? Indiquez une date et une heure, par exemple _demain 9h_ ou _12 oct 10h_. Vous pouvez aussi donner les deux dates, comme _du 12 au 17 oct_.",
    ),
  askReturnDateTime: (pickup) =>
    textReply(
      `Prise en charge : ${pickup}.\nQuand rendrez-vous la voiture ? Indiquez une date et une heure, ou le nombre de jours (par exemple _5 jours_).`,
    ),
  askTime: (date) =>
    buttonsReply(
      `À quelle heure le ${date} ?`,
      ["09:00", "12:00", "17:00"].map((t) => ({
        id: `time:${t}`,
        title: timeLabel(t, "fr"),
      })),
    ),
  askMeridiem: (options) =>
    buttonsReply(
      "Plutôt le matin ou le soir ?",
      options.map((t) => ({ id: `time:${t}`, title: timeLabel(t, "fr") })),
    ),
  askWhichDate: (options) =>
    buttonsReply(
      "Quelle date voulez-vous dire ?",
      options.map((o) => ({ id: `date:${o.iso}`, title: o.label })),
    ),
  dateNotUnderstood: () =>
    textReply(
      "Désolé, je n'ai pas compris cette date. Essayez par exemple _demain 9h_, _12 oct 10h_ ou _vendredi prochain 14h_.",
    ),
  datePast: () =>
    textReply(
      "Cette date ou cette heure est déjà passée. Indiquez une date et une heure à venir.",
    ),
  returnBeforePickup: () =>
    textReply(
      "Le retour doit être après la prise en charge. Indiquez une date et une heure de retour plus tardives.",
    ),
  noAvailabilityForDates: () =>
    buttonsReply(
      "Désolé, aucune voiture n'est disponible à ces dates. Voulez-vous essayer d'autres dates ?",
      [
        { id: IDS.menu.checkAvailability, title: "Autres dates" },
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      ],
    ),

  askPickupLocation: (locs) =>
    listReply(
      "Où souhaitez-vous récupérer la voiture ?",
      "Lieux",
      locRows(locs),
    ),
  askDropoffLocation: (locs, pickup) =>
    listReply(
      `Où la rendrez-vous ? Prise en charge : ${pickup}.`,
      "Lieux",
      [{ id: IDS.loc.same, title: "Même lieu" }, ...locRows(locs)].slice(0, 10),
    ),
  locationNotUnderstood: (locs) =>
    listReply(
      "Je n'ai pas reconnu ce lieu. Choisissez dans la liste.",
      "Lieux",
      locRows(locs),
    ),
  locationAmbiguous: (locs) =>
    listReply("Lequel voulez-vous dire ?", "Lieux", locRows(locs)),

  askName: (existing) =>
    existing
      ? buttonsReply(
          `Quel est le nom complet pour la réservation, exactement comme sur votre passeport ou permis ? Ou gardez *${existing}*.`,
          [
            { id: IDS.name.keep, title: "Garder ce nom" },
            { id: IDS.nav.back, title: "Retour" },
          ],
        )
      : textReply(
          "Quel est votre nom complet, exactement comme sur votre passeport ou permis de conduire ?",
        ),
  nameInvalid: (reason) =>
    textReply(
      reason === "ONE_WORD"
        ? "Indiquez votre prénom et votre nom, exactement comme sur votre passeport ou permis de conduire."
        : "Cela ne ressemble pas à un nom complet. Écrivez uniquement votre prénom et votre nom, avec des lettres.",
    ),

  summary: (s) =>
    buttonsReply(
      [
        "*Récapitulatif de la réservation*",
        `🚗 ${s.carName}`,
        `📅 ${dt(s.pickupAt)} → ${dt(s.returnAt)} (${s.rentalDays} jour${s.rentalDays === 1 ? "" : "s"})`,
        `📍 Prise en charge : ${s.pickupLocation}`,
        ...(s.dropoffLocation !== s.pickupLocation
          ? [`📍 Restitution : ${s.dropoffLocation}`]
          : []),
        `👤 Nom : ${s.customerName}`,
        "",
        ...s.lineItems.map((i) => `${frLabel(i.label)} : ${price(i.amountRs)}`),
        `*Total : ${price(s.totalRs)}* — à payer en espèces à la remise des clés.`,
        "",
        "Tout est correct ?",
      ].join("\n"),
      [
        { id: IDS.confirm.yes, title: "Confirmer" },
        { id: IDS.confirm.change, title: "Modifier" },
        { id: IDS.confirm.cancel, title: "Annuler" },
      ],
    ),
  changeMenu: () =>
    listReply("Que souhaitez-vous modifier ?", "Modifier", [
      { id: IDS.change.car, title: "Voiture" },
      { id: IDS.change.dates, title: "Dates et heures" },
      { id: IDS.change.pickup, title: "Lieu de prise en charge" },
      { id: IDS.change.dropoff, title: "Lieu de restitution" },
      { id: IDS.change.name, title: "Nom" },
    ]),
  confirmed: (n, url, hours) =>
    textReply(
      `✅ Votre réservation n°${n} est confirmée.\n\nProchaine étape : envoyez une photo de votre passeport et de votre permis de conduire via ce lien privé (valable ${hours} heures) :\n${url}\n\nLe paiement se fait en espèces à la remise des clés. Notre équipe vérifiera vos documents et vous tiendra informé.`,
    ),

  vehicleUnavailable: (car, alts) =>
    alts.length > 0
      ? listReply(
          `Désolé, la ${car} n'est pas disponible à ces dates. Ces voitures sont libres aux mêmes dates :`,
          "Voir les voitures",
          carRows(alts),
        )
      : buttonsReply(
          `Désolé, la ${car} n'est pas disponible à ces dates et aucune autre voiture n'est libre. Voulez-vous essayer d'autres dates ?`,
          [
            { id: IDS.change.dates, title: "Changer les dates" },
            { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
          ],
        ),
  domainError: (code, ctx) => {
    const text: Partial<Record<typeof code, string>> = {
      INVALID_DATES:
        "Ces dates ne conviennent pas — le retour doit être après la prise en charge, et les deux dans le futur.",
      BELOW_MINIMUM_RENTAL: `La location minimale est de ${ctx?.minDays ?? 1} jour${(ctx?.minDays ?? 1) === 1 ? "" : "s"}. Choisissez un retour plus tardif.`,
      OUTSIDE_OPENING_HOURS: `${ctx?.locationName ?? "Ce lieu"} est fermé à l'heure choisie. Choisissez une heure dans les horaires d'ouverture ou un autre lieu.`,
      LOCATION_NOT_FOUND:
        "Je n'ai pas pu utiliser ce lieu. Choisissez-en un dans la liste.",
      VEHICLE_NOT_FOUND:
        "Cette voiture n'est plus disponible. Choisissez-en une autre.",
    };
    return buttonsReply(
      text[code] ??
        "Désolé, je n'ai pas pu terminer cette étape. Vous pouvez revenir en arrière ou parler à quelqu'un de notre équipe.",
      navButtons,
    );
  },

  noActiveBooking: () =>
    buttonsReply(
      "Je n'ai trouvé aucune réservation confirmée sur ce numéro. Voulez-vous en faire une nouvelle, ou parler à quelqu'un ?",
      [
        { id: IDS.menu.viewCars, title: "Voir les voitures" },
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      ],
    ),
  chooseBooking: (bookings) =>
    listReply(
      "Vous avez plusieurs réservations. Laquelle ?",
      "Réservations",
      bookings.map((b) => ({
        id: bookingPickId(b.id),
        title: `Réservation n°${b.bookingNumber}`,
        description: b.label,
      })),
    ),
  statusCard: (d) =>
    listReply(`${card(d)}\n\nComment pouvons-nous vous aider ?`, "Options", [
      { id: IDS.req.delay, title: "Signaler un retard" },
      { id: IDS.req.extension, title: "Prolonger" },
      { id: IDS.req.pickupChange, title: "Changer l'heure" },
      { id: IDS.req.cancel, title: "Annuler" },
      { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
    ]),
  awaitingDocuments: (d, url) =>
    buttonsReply(
      `${card(d)}${url && d.documentStatus === "NOT_SUBMITTED" ? `\n\nEnvoyez vos documents ici :\n${url}` : ""}`,
      [
        { id: IDS.menu.existingBooking, title: "Options" },
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      ],
    ),
  askChangeDetails: (type, ctx) => {
    const now = (v: string | null) => (v ? ` (actuellement ${dt(v)})` : "");
    const text: Record<ChangeKind, string> = {
      RETURN_DELAY: `Quel retard aurez-vous ? Indiquez la nouvelle heure de retour${now(ctx.currentReturnAt)}, ou un retard comme _2 heures_.`,
      EXTENSION: `Jusqu'à quand souhaitez-vous garder la voiture${now(ctx.currentReturnAt)} ? Indiquez une nouvelle date et heure de retour.`,
      PICKUP_TIME_CHANGE: `Quelle nouvelle date et heure de prise en charge souhaitez-vous${now(ctx.currentPickupAt)} ?`,
      CANCELLATION:
        "Je peux envoyer une demande d'annulation à notre équipe. Dites-moi brièvement pourquoi, ou appuyez sur Envoyer.",
    };
    return type === "CANCELLATION"
      ? buttonsReply(text[type], [
          { id: IDS.confirm.yes, title: "Envoyer" },
          { id: IDS.menu.main, title: "Menu principal" },
        ])
      : textReply(text[type]);
  },
  changeNotUnderstood: (type) =>
    textReply(
      type === "RETURN_DELAY"
        ? "Désolé, je n'ai pas compris. Indiquez une nouvelle heure de retour (ex. _aujourd'hui 18h_) ou un retard (ex. _2 heures_)."
        : "Désolé, je n'ai pas compris cette date. Essayez par exemple _demain 17h_ ou _20 oct 10h_.",
    ),
  changeConfirm: (c) =>
    buttonsReply(
      [
        `Vérifiez votre demande pour la réservation n°${c.bookingNumber} :`,
        `*${CHANGE_LABEL[c.type][0].toUpperCase()}${CHANGE_LABEL[c.type].slice(1)}*`,
        c.newReturnAt ? `Nouveau retour : ${dt(c.newReturnAt)}` : null,
        c.newPickupAt
          ? `Nouvelle prise en charge : ${dt(c.newPickupAt)}`
          : null,
        c.note ? `Remarque : ${c.note}` : null,
        "",
        "Je vais l'envoyer à notre équipe. Elle n'est pas acceptée tant que l'équipe n'a pas confirmé.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
      [
        { id: IDS.confirm.yes, title: "Envoyer" },
        { id: IDS.confirm.change, title: "Modifier" },
        { id: IDS.confirm.cancel, title: "Laisser tomber" },
      ],
    ),
  changeSent: (c, quote) =>
    buttonsReply(
      [
        `✅ Votre demande de ${CHANGE_LABEL[c.type]} pour la réservation n°${c.bookingNumber} a été envoyée à notre équipe.`,
        quote.additionalRs > 0
          ? `Coût supplémentaire estimé si elle est acceptée : ${price(quote.additionalRs)}.`
          : null,
        !quote.availabilityOk
          ? "Remarque : la voiture n'est peut-être pas libre à ce moment — l'équipe vérifiera."
          : null,
        "Elle n'est pas encore acceptée ; nous vous écrirons ici dès que l'équipe aura décidé.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
      [
        { id: IDS.menu.existingBooking, title: "Ma réservation" },
        { id: IDS.menu.main, title: "Menu principal" },
      ],
    ),
  paymentClaim: () =>
    buttonsReply(
      "Merci de nous prévenir. Le paiement se fait uniquement en espèces à la remise des clés, et je ne peux pas confirmer un paiement dans ce chat — notre équipe enregistre elle-même les paiements. Je lui ai laissé une note, ou vous pouvez parler à quelqu'un maintenant.",
      [
        { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
        { id: IDS.menu.main, title: "Menu principal" },
      ],
    ),

  faqAnswer: (a) =>
    buttonsReply(a, [
      { id: IDS.faq.helpful, title: "Utile 👍" },
      { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
    ]),
  faqInline: (a) => a,
  faqThanks: () =>
    buttonsReply("Ravi d'avoir pu aider ! Autre chose ?", [
      { id: IDS.menu.main, title: "Menu principal" },
      { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
    ]),
  faqNoAnswer: () =>
    buttonsReply("Désolé. Voulez-vous parler à quelqu'un de notre équipe ?", [
      { id: IDS.menu.talkHuman, title: "Parler à quelqu'un" },
      { id: IDS.menu.main, title: "Menu principal" },
    ]),
  backToBooking: () => "Retour à votre réservation :",
};
