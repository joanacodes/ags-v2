/**
 * The Astro Study test's words, in English and French (TASK-0013). Interface text only: no astrology
 * meaning lives here.
 */
import type { StudyLanguage, StudyLength } from "./quiz";

export interface StudyCopy {
  readonly brand: string;
  readonly otherLanguage: string;
  readonly title: string;
  readonly intro: readonly string[];
  readonly name: string;
  readonly nameHint: string;
  readonly email: string;
  readonly emailHint: string;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly noTime: string;
  readonly noTimeHint: string;
  readonly place: string;
  readonly placeHint: string;
  readonly placeFound: string;
  readonly placeNone: string;
  readonly length: string;
  readonly lengths: Readonly<Record<StudyLength, { readonly title: string; readonly detail: string }>>;
  readonly consent: string;
  readonly privacy: string;
  readonly news: string;
  readonly start: string;
  readonly preparing: string;
  readonly fixFields: string;
  readonly problems: Readonly<Record<string, string>>;
  readonly questionOf: (n: number, total: number) => string;
  readonly pick: string;
  readonly sending: string;
  readonly resultTitle: string;
  readonly resultLine: (recognised: number, answered: number) => string;
  readonly chance: (percent: number) => string;
  readonly yourChartSaid: string;
  readonly recognised: string;
  readonly notRecognised: string;
  readonly linkTitle: string;
  readonly linkText: string;
  readonly password: string;
  readonly openChart: string;
  readonly noLink: string;
  readonly notFound: string;
  readonly loading: string;
}

export const STUDY_COPY: Readonly<Record<StudyLanguage, StudyCopy>> = {
  en: {
    brand: "The Astro Study",
    otherLanguage: "Français",
    title: "Do you recognise yourself?",
    intro: [
      "Each question shows three short descriptions of one part of life. One was written from your birth chart; the two others from other people’s charts. Pick the one that sounds most like you.",
      "Luck alone finds yours one time in three. Free, for adults (18 and over).",
    ],
    name: "Your name",
    nameHint: "First name, full name or a nickname",
    email: "Email",
    emailHint: "To keep your results with your chart.",
    birthDate: "Date of birth",
    birthTime: "Time of birth",
    noTime: "I don’t know my birth time",
    noTimeHint: "The test still works, with fewer kinds of question.",
    place: "Place of birth",
    placeHint: "Start typing a town, then pick it in the list.",
    placeFound: "Found",
    placeNone: "No match yet: try a nearby town.",
    length: "How long a test?",
    lengths: {
      short: { title: "Short", detail: "5 questions, about 2 minutes" },
      medium: { title: "Medium", detail: "10 questions, about 5 minutes" },
      long: { title: "Long", detail: "20 questions, about 10 minutes" },
    },
    consent: "I agree that my birth details and my answers are kept for The Astro Study, as the privacy notice explains.",
    privacy: "Privacy notice",
    news: "Send me news from The Astro Study. You can unsubscribe at any time.",
    start: "Start the test",
    preparing: "Drawing your chart and writing your questions… about half a minute.",
    fixFields: "Fill in every field, and pick your birthplace in the list.",
    problems: {
      full_today: "Today’s tests are all taken. Come back tomorrow.",
      already_today: "This email has already taken today’s test. Come back tomorrow.",
      under_18: "The test is for adults, 18 and over.",
      chart_failed: "Your chart couldn’t be calculated. Check your birth details and try again.",
      not_ready: "The test isn’t open yet. Please come back a little later.",
      ai_failed: "Your questions couldn’t be written just now. Please try again in a minute.",
      INVALID_INPUT: "Some details are missing or not valid.",
      default: "Something went wrong. Please try again.",
    },
    questionOf: (n, total) => `Question ${n} of ${total}`,
    pick: "Which one sounds most like you?",
    sending: "Saving…",
    resultTitle: "Your result",
    resultLine: (recognised, answered) => `You recognised yourself in ${recognised} of ${answered}.`,
    chance: (percent) => `Luck alone gives ${percent}%.`,
    yourChartSaid: "Your chart said",
    recognised: "You picked it",
    notRecognised: "You picked another one",
    linkTitle: "Your chart",
    linkText: "Your full reading is being written now. It appears on your private page within a few hours, with a PDF to download.",
    password: "Password: your date of birth as 8 digits, day first. 14 March 1990 is 14031990.",
    openChart: "Open my chart",
    noLink: "Your private page couldn’t be made just now. Your results are saved.",
    notFound: "This test doesn’t exist.",
    loading: "Loading…",
  },
  fr: {
    brand: "The Astro Study",
    otherLanguage: "English",
    title: "Vous reconnaissez-vous ?",
    intro: [
      "Chaque question montre trois courtes descriptions d’un domaine de la vie. L’une a été écrite à partir de votre thème natal ; les deux autres, à partir des thèmes d’autres personnes. Choisissez celle qui vous ressemble le plus.",
      "Le hasard seul trouve la vôtre une fois sur trois. Gratuit, pour les adultes (18 ans et plus).",
    ],
    name: "Votre nom",
    nameHint: "Prénom, nom complet ou pseudo",
    email: "Email",
    emailHint: "Pour garder vos résultats avec votre thème.",
    birthDate: "Date de naissance",
    birthTime: "Heure de naissance",
    noTime: "Je ne connais pas mon heure de naissance",
    noTimeHint: "Le test fonctionne quand même, avec moins de sortes de questions.",
    place: "Lieu de naissance",
    placeHint: "Commencez à taper une ville, puis choisissez-la dans la liste.",
    placeFound: "Trouvé",
    placeNone: "Pas encore de résultat : essayez une ville voisine.",
    length: "Quelle durée ?",
    lengths: {
      short: { title: "Court", detail: "5 questions, environ 2 minutes" },
      medium: { title: "Moyen", detail: "10 questions, environ 5 minutes" },
      long: { title: "Long", detail: "20 questions, environ 10 minutes" },
    },
    consent: "J’accepte que mes données de naissance et mes réponses soient conservées pour The Astro Study, comme l’explique la politique de confidentialité.",
    privacy: "Politique de confidentialité",
    news: "Envoyez-moi les nouvelles de The Astro Study. Je peux me désinscrire à tout moment.",
    start: "Commencer le test",
    preparing: "Je dresse votre thème et j’écris vos questions… environ trente secondes.",
    fixFields: "Remplissez chaque champ, et choisissez votre lieu de naissance dans la liste.",
    problems: {
      full_today: "Les tests du jour sont tous pris. Revenez demain.",
      already_today: "Cet email a déjà passé le test aujourd’hui. Revenez demain.",
      under_18: "Le test est réservé aux adultes, 18 ans et plus.",
      chart_failed: "Votre thème n’a pas pu être calculé. Vérifiez vos données de naissance et réessayez.",
      not_ready: "Le test n’est pas encore ouvert. Revenez un peu plus tard.",
      ai_failed: "Vos questions n’ont pas pu être écrites pour l’instant. Réessayez dans une minute.",
      INVALID_INPUT: "Certaines informations manquent ou ne sont pas valides.",
      default: "Un problème est survenu. Réessayez.",
    },
    questionOf: (n, total) => `Question ${n} sur ${total}`,
    pick: "Laquelle vous ressemble le plus ?",
    sending: "Enregistrement…",
    resultTitle: "Votre résultat",
    resultLine: (recognised, answered) => `Vous avez reconnu votre thème ${recognised} fois sur ${answered}.`,
    chance: (percent) => `Le hasard seul donne ${percent} %.`,
    yourChartSaid: "Votre thème disait",
    recognised: "Vous l’avez choisie",
    notRecognised: "Vous en avez choisi une autre",
    linkTitle: "Votre thème",
    linkText: "Votre lecture complète est en cours d’écriture. Elle apparaît sur votre page privée d’ici quelques heures, avec un PDF à télécharger.",
    password: "Mot de passe : votre date de naissance en 8 chiffres, le jour d’abord. Le 14 mars 1990 donne 14031990.",
    openChart: "Ouvrir mon thème",
    noLink: "Votre page privée n’a pas pu être créée pour l’instant. Vos résultats sont enregistrés.",
    notFound: "Ce test n’existe pas.",
    loading: "Chargement…",
  },
};

/** The privacy notice the test points to (the Astro Study site's own). */
export const STUDY_PRIVACY_URL: Readonly<Record<StudyLanguage, string>> = {
  en: process.env.NEXT_PUBLIC_STUDY_PRIVACY_URL_EN ?? "https://astrostudy.co.uk/privacy/",
  fr: process.env.NEXT_PUBLIC_STUDY_PRIVACY_URL_FR ?? "https://astrostudy.co.uk/fr/confidentialite/",
};
