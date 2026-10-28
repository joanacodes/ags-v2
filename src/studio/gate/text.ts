/**
 * The text gate: every piece goes through it after writing and again before posting. Each check is
 * deterministic, can be turned off in Settings → Gate, and names what failed and where, so the writer's
 * one retry knows what to fix and the owner sees why a piece stopped.
 *
 * What the brand forbids everywhere (the kit's extras, emoji, predictions, the no-go subjects, figures
 * without a source) is checked on every field. AGS's list of astrology words applies to test statements
 * only: a placements post names Saturn by design, but a statement in the blind test never may.
 */
// The blind test's own list (src/study), read where it lives so the two can never drift apart.
import termsJson from "../../study/banned-terms.json";
import type { Kit } from "../kit/schema";
import type { Figure, Format, Language, Platform, Slide } from "../types";
import type { GateResult } from "../store/rows";

export interface GateInput {
  readonly platform: Platform;
  readonly format: Format;
  readonly language: Language;
  readonly script?: string | null;
  readonly lines?: readonly string[] | null;
  readonly caption?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly tags?: readonly string[];
  readonly slides?: readonly Slide[] | null;
  readonly disclosure: boolean;
  /** The descriptions shown in a test-format piece (A, B, C): the blind test's own rule applies. */
  readonly statements?: readonly string[];
  readonly card: { readonly hook: string; readonly figures: readonly Figure[]; readonly anchor: string | null };
  /** The links this piece may carry (its own test link with src, the kit's links). */
  readonly allowedLinks: readonly string[];
}

export type GateCheck =
  | "length"
  | "extras"
  | "statements"
  | "jargon"
  | "emoji"
  | "disclosure"
  | "figures"
  | "prediction"
  | "keyword"
  | "french"
  | "urls"
  | "nogo";

export type GateChecks = Readonly<Record<GateCheck, boolean>>;

export const ALL_CHECKS: GateChecks = {
  length: true,
  extras: true,
  statements: true,
  jargon: true,
  emoji: true,
  disclosure: true,
  figures: true,
  prediction: true,
  keyword: true,
  french: true,
  urls: true,
  nogo: true,
};

export const CHECK_LABELS: Readonly<Record<GateCheck, string>> = {
  length: "Lengths per network and format",
  extras: "The kit's banned words",
  statements: "No astrology word in a test statement",
  jargon: "No jargon in a hook",
  emoji: "No emoji in bodies",
  disclosure: "AI-voice disclosure on voiced pieces",
  figures: "Every figure sourced and verified",
  prediction: "No prediction about the reader",
  keyword: "The keyword in a video's first five words",
  french: "French pieces in French, with vous",
  urls: "No link but the piece's own",
  nogo: "No no-go subject",
};

interface Failure {
  check: GateCheck;
  message: string;
  span?: string;
}

export const words = (text: string): string[] => text.trim().split(/\s+/).filter((w) => w.length > 0);
export const wordCount = (text: string | null | undefined): number => (text ? words(text).length : 0);

const VOICED: ReadonlySet<Format> = new Set(["video", "long_video"]);

function texts(input: GateInput): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const push = (field: string, text: string | null | undefined) => {
    if (text && text.trim()) out.push({ field, text });
  };
  push("script", input.script);
  input.lines?.forEach((l, i) => push(`lines.${i}`, l));
  push("caption", input.caption);
  push("title", input.title);
  push("description", input.description);
  input.slides?.forEach((s, i) => {
    push(`slides.${i}.heading`, s.heading);
    push(`slides.${i}.body`, s.body);
  });
  input.statements?.forEach((s, i) => push(`statements.${i}`, s));
  return out;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** AGS's rule for a statement in the blind test (src/study/quiz.ts, checkStatement). */
export function astrologyTermIn(text: string, language: Language): string | null {
  for (const noun of termsJson.properNouns[language]) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(noun)}(?=$|[^\\p{L}\\p{N}])`, "u").test(text)) return noun;
  }
  for (const source of termsJson.patterns[language]) {
    if (new RegExp(source, "iu").test(text)) return source;
  }
  return null;
}

const JARGON: Readonly<Record<Language, readonly string[]>> = {
  en: ["conjunct", "sextile", "\\btrine\\b", "quincunx", "\\borbs?\\b", "\\bdecans?\\b", "dispositor", "\\bdetriment\\b", "exaltation", "ephemeris", "synodic", "\\bapplying\\b", "\\bseparating\\b"],
  fr: ["conjonction", "sextile", "trigone", "quinconce", "\\borbes?\\b", "\\bdécans?\\b", "dispositeur", "\\bexil\\b", "exaltation", "éphémérides?", "synodique"],
};

/** Phrases that tell the reader what will happen to them (tendencies, not fate). */
const PREDICTION: Readonly<Record<Language, readonly RegExp[]>> = {
  en: [
    /\byou(?:'|’)?ll (?:meet|fall|lose|win|finally|get married|be (?:rich|lucky|happy)|receive|inherit|break up)\b/i,
    /\byou will (?:meet|fall|lose|win|finally|find love|get|be|receive|inherit|break up|have)\b/i,
    /\b(?:you(?:'|’)re|you are) going to (?:meet|fall|lose|win|find|get|be|receive|break up)\b/i,
    /\bthis (?:week|month|year) you(?:'|’)?(?:ll| will)\b/i,
    /\bwill happen to you\b/i,
    /\bis going to happen\b/i,
    /\bget ready for\b/i,
  ],
  fr: [
    /\bvous allez (?:rencontrer|tomber|perdre|gagner|enfin|trouver|recevoir|hériter|rompre|vivre)\b/i,
    /\bvous (?:rencontrerez|perdrez|gagnerez|trouverez l’amour|trouverez l'amour|recevrez|hériterez|romprez)\b/i,
    /\bcette (?:semaine|année) vous (?:allez|serez|aurez)\b/i,
    /\bce mois-ci vous (?:allez|serez|aurez)\b/i,
    /\bva vous arriver\b/i,
    /\bpréparez-vous à\b/i,
  ],
};

/** The no-go subjects, by the words that give them away (targeted, so a hook about one's own childhood or healing stays). */
const NO_GO: Readonly<Record<Language, readonly { subject: string; re: RegExp }[]>> = {
  en: [
    { subject: "health", re: /\b(?:illness|disease|diagnos\w*|symptoms?|medication|medicines?|surgery|chemo\w*|tumou?rs?|mental illness|clinical depression)\b/i },
    { subject: "death", re: /\b(?:death|dying|die|dies|funerals?|suicide|grief over (?:a|the) death)\b/i },
    { subject: "pregnancy", re: /\b(?:pregnan\w*|fertility|miscarriage|conceive|ivf)\b/i },
    { subject: "legal advice", re: /\b(?:lawsuits?|legal advice|court case|sue (?:them|him|her)|custody)\b/i },
    { subject: "money advice", re: /\b(?:invest(?:ing|ment)?s?|stock market|stocks|crypto\w*|lottery|gambl\w*|bitcoin|trading tips)\b/i },
    { subject: "children", re: /\byour (?:child|children|kids?|baby|babies|son|daughter|teen(?:ager)?s?)\b/i },
    { subject: "fear", re: /\b(?:doom\w*|cursed?|curses|karmic debt|punish(?:ed|ment) by the|beware|warning:)\b/i },
  ],
  fr: [
    { subject: "santé", re: /\b(?:maladies?|diagnostics?|symptômes?|médicaments?|traitements? médica\w*|chirurgie|tumeurs?|dépression clinique)\b/i },
    { subject: "mort", re: /\b(?:la mort|mourir|décès|funérailles|suicide)\b/i },
    { subject: "grossesse", re: /\b(?:grossesse|enceinte|fertilité|fausse couche|fiv)\b/i },
    { subject: "conseil juridique", re: /\b(?:procès|conseil juridique|avocat|garde des enfants|poursuivre en justice)\b/i },
    { subject: "conseil financier", re: /\b(?:investi\w*|bourse|actions en bourse|crypto\w*|loto|loterie|jeux d’argent|jeux d'argent|bitcoin)\b/i },
    { subject: "enfants", re: /\bvotre (?:enfant|bébé|fils|fille|ado(?:lescent)?)\b|\bvos enfants\b/i },
    { subject: "peur", re: /\b(?:maudit\w*|malédictions?|dette karmique|méfiez-vous|attention danger)\b/i },
  ],
};

const EN_STOP = ["the", "and", "you", "your", "is", "are", "of", "to", "in", "it", "that", "this", "with", "for", "what", "who", "one", "was"];
const FR_STOP = ["le", "la", "les", "et", "vous", "votre", "vos", "est", "sont", "de", "des", "du", "un", "une", "que", "qui", "pour", "dans", "ce", "cette", "pas"];

function frenchScore(text: string): { fr: number; en: number } {
  const ws = words(text.toLowerCase().replace(/[.,;:!?«»“”"()’']/g, " "));
  let fr = 0;
  let en = 0;
  for (const w of ws) {
    if (FR_STOP.includes(w)) fr += 1;
    if (EN_STOP.includes(w)) en += 1;
  }
  return { fr, en };
}

/** Figure-like tokens: percentages, "7 in 10", "7 out of 10", "7/10", "8 times out of 10", "x3", large counts. */
const FIGURE_RE =
  /(\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s+(?:in|out of|sur)\s+\d+\b|\b\d+\s?\/\s?\d+\b|\b\d+\s+(?:times|fois)\s+(?:out of|sur)\s+\d+\b|\b\d{2,}(?:[.,]\d+)?\s+(?:people|tests?|charts?|readings?|personnes|thèmes|lectures)\b)/gi;

/** What the test itself makes true, needing no source: luck is one in three. */
const STANDING_FACTS = [/\b1 in 3\b/i, /\bone in three\b/i, /\bone time in three\b/i, /\b3 out of 10\b/i, /\b1 sur 3\b/i, /\bune fois sur trois\b/i, /\b3 sur 10\b/i, /\b18\+/];

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/\bout of\b/g, "in").replace(/\bsur\b/g, "in").replace(/\s?%/g, "%").trim();

function figureAllowed(token: string, figures: readonly Figure[]): boolean {
  const t = normalise(token);
  if (STANDING_FACTS.some((re) => re.test(token))) return true;
  return figures.some((f) => f.verified && (normalise(f.value).includes(t) || normalise(`${f.value} ${f.label}`).includes(t) || t.includes(normalise(f.value))));
}

const EMOJI = /\p{Extended_Pictographic}/u;
const URL_RE = /\bhttps?:\/\/[^\s)]+|\b(?:www\.)?[a-z0-9-]+\.(?:co\.uk|com|fr|org|net|io)\/[^\s)]*/gi;

export interface LengthRule {
  readonly scriptWords?: readonly [number, number];
  readonly lineWords?: number;
  readonly maxLines?: number;
  readonly captionMax?: number;
  readonly leadMax?: number;
  readonly titleMax?: number;
  readonly descriptionMax?: number;
  readonly slides?: readonly [number, number];
  readonly slideWords?: number;
  readonly hashtags?: readonly [number, number];
  readonly topicTags?: number;
  readonly bodyWords?: readonly [number, number];
  readonly keywordTwice?: boolean;
}

/** The rules for one platform and format, from the kit with the build prompt's numbers as the floor. */
export function lengthRule(kit: Kit, platform: Platform, format: Format): LengthRule {
  const conf = kit.platforms[platform];
  const caption = conf?.caption;
  const base: LengthRule = {
    captionMax: caption?.max,
    leadMax: caption?.lead_max,
    titleMax: conf?.title?.max,
    hashtags: caption?.hashtags,
    topicTags: caption?.topic_tags,
  };
  switch (format) {
    case "video":
      return { ...base, scriptWords: [40, 70], lineWords: 6, maxLines: 8 };
    case "long_video":
      return { ...base, scriptWords: [900, 1700] };
    case "carousel":
      return { ...base, slides: [5, 7], slideWords: 20 };
    case "pin":
      return { ...base, titleMax: conf?.title?.max ?? 100, descriptionMax: caption?.max ?? 500, keywordTwice: true, hashtags: [0, 0] };
    case "story":
      return { ...base, lineWords: 12, maxLines: 3 };
    case "still":
      return { ...base, lineWords: 25, maxLines: 4 };
    case "issue":
      return { ...base, bodyWords: (conf?.words as [number, number] | undefined) ?? [600, 900] };
    default:
      return base;
  }
}

/** The words a video must say first, and a pin must repeat: the card's anchor, or "birth chart". */
export function keywordsFor(card: { anchor: string | null }, language: Language): string[] {
  const base = language === "fr" ? ["thème natal", "thème astral"] : ["birth chart"];
  return card.anchor ? [card.anchor.toLowerCase(), ...base] : base;
}

export function checkText(input: GateInput, kit: Kit, enabled: GateChecks = ALL_CHECKS, now: Date = new Date()): GateResult {
  const failures: Failure[] = [];
  const warnings: { check: string; message: string }[] = [];
  const all = texts(input);
  const lang = input.language;
  const fail = (check: GateCheck, message: string, span?: string) => failures.push(span ? { check, message, span } : { check, message });

  if (enabled.length) {
    const rule = lengthRule(kit, input.platform, input.format);
    if (rule.scriptWords) {
      const n = wordCount(input.script);
      if (n < rule.scriptWords[0] || n > rule.scriptWords[1]) fail("length", `the script has ${n} words; it must have ${rule.scriptWords[0]} to ${rule.scriptWords[1]}`);
    }
    if (rule.lineWords && input.lines) {
      input.lines.forEach((l, i) => {
        const n = wordCount(l);
        if (n > rule.lineWords!) fail("length", `on-screen line ${i + 1} has ${n} words; six at most`, l);
      });
    }
    if (rule.maxLines && input.lines && input.lines.length > rule.maxLines) fail("length", `${input.lines.length} on-screen lines; ${rule.maxLines} at most`);
    if (rule.captionMax && input.caption && [...input.caption].length > rule.captionMax) {
      fail("length", `the caption has ${[...input.caption].length} characters; ${input.platform} takes ${rule.captionMax}`);
    }
    if (rule.leadMax && input.caption) {
      const lead = input.caption.split("\n")[0] ?? "";
      if ([...lead].length > rule.leadMax) fail("length", `the caption's first line has ${[...lead].length} characters; ${rule.leadMax} at most`, lead);
    }
    if (rule.titleMax && input.title && [...input.title].length > rule.titleMax) fail("length", `the title has ${[...input.title].length} characters; ${rule.titleMax} at most`);
    if (input.platform === "youtube" && VOICED.has(input.format) && !input.title?.trim()) fail("length", "a YouTube video needs a title");
    if (rule.descriptionMax && input.description && [...input.description].length > rule.descriptionMax) {
      fail("length", `the description has ${[...input.description].length} characters; ${rule.descriptionMax} at most`);
    }
    if (rule.slides) {
      const n = input.slides?.length ?? 0;
      if (n < rule.slides[0] || n > rule.slides[1]) fail("length", `${n} slides; a carousel has ${rule.slides[0]} to ${rule.slides[1]}`);
      input.slides?.forEach((s, i) => {
        const n2 = wordCount(`${s.heading} ${s.body}`);
        if (rule.slideWords && n2 > rule.slideWords) fail("length", `slide ${i + 1} has ${n2} words; ${rule.slideWords} at most`, s.heading);
      });
    }
    if (rule.hashtags && input.tags) {
      const n = input.tags.length;
      if (n < rule.hashtags[0] || n > rule.hashtags[1]) fail("length", `${n} hashtags; ${input.platform} takes ${rule.hashtags[0]} to ${rule.hashtags[1]}`);
    }
    if (rule.topicTags !== undefined && input.tags && input.tags.length > rule.topicTags) fail("length", `${input.tags.length} topic tags; Threads takes ${rule.topicTags}`);
    if (rule.bodyWords) {
      const n = wordCount(input.description);
      if (n < rule.bodyWords[0] || n > rule.bodyWords[1]) fail("length", `the issue has ${n} words; it must have ${rule.bodyWords[0]} to ${rule.bodyWords[1]}`);
    }
    if (rule.keywordTwice && enabled.keyword) {
      const keys = keywordsFor(input.card, lang);
      const title = (input.title ?? "").toLowerCase();
      const desc = (input.description ?? "").toLowerCase();
      const inTitle = keys.filter((k) => title.includes(k));
      if (inTitle.length === 0) fail("keyword", `the pin's title must carry its keyword (${keys.join(" or ")})`, input.title ?? "");
      else if (!inTitle.some((k) => desc.split(k).length - 1 >= 2)) fail("keyword", `the pin's description must carry its keyword ("${inTitle.join('" or "')}") twice`);
    }
  }

  if (enabled.extras) {
    const extras = kit.banned_extras[lang];
    for (const { field, text } of all) {
      const hit = extras.find((w) => text.toLowerCase().includes(w.toLowerCase()));
      if (hit) fail("extras", `"${hit}" is one of the kit's banned words (${field})`, hit);
    }
  }

  if (enabled.statements && input.statements) {
    input.statements.forEach((s, i) => {
      const hit = astrologyTermIn(s, lang);
      if (hit) fail("statements", `statement ${String.fromCharCode(65 + i)} names something astrological (${hit}): the test must stay blind`, s);
    });
  }

  if (enabled.jargon) {
    const firstLines = [input.card.hook, input.lines?.[0], input.slides?.[0]?.heading].filter((t): t is string => !!t);
    for (const t of firstLines) {
      const hit = JARGON[lang].find((src) => new RegExp(src, "iu").test(t));
      if (hit) fail("jargon", `the hook uses jargon (${hit.replace(/\\b/g, "")})`, t);
    }
  }

  if (enabled.emoji) {
    for (const { field, text } of all) {
      const m = EMOJI.exec(text);
      if (m) fail("emoji", `an emoji in ${field}: no emoji in bodies`, m[0]);
    }
  }

  if (enabled.disclosure && VOICED.has(input.format) && (input.script ?? "").trim()) {
    if (!input.disclosure) fail("disclosure", "a voiced piece must carry the AI-voice disclosure");
    const line = kit.disclosure[lang].toLowerCase();
    const where = `${input.caption ?? ""}\n${input.description ?? ""}`.toLowerCase();
    if (!where.includes(line)) fail("disclosure", `the caption must carry the disclosure line: "${kit.disclosure[lang]}"`);
  }

  if (enabled.figures) {
    for (const { field, text } of all) {
      if (field.startsWith("statements")) continue;
      for (const m of text.matchAll(FIGURE_RE)) {
        if (!figureAllowed(m[0], input.card.figures)) fail("figures", `"${m[0]}" (${field}) is not one of the card's verified figures`, m[0]);
      }
    }
    for (const f of input.card.figures) {
      if (!f.verified) {
        const used = all.some(({ text }) => normalise(text).includes(normalise(f.value)));
        if (used) fail("figures", `the figure "${f.value}" is not verified, so it can't be shown`, f.value);
      }
    }
  }

  if (enabled.prediction) {
    for (const { field, text } of all) {
      const re = PREDICTION[lang].find((r) => r.test(text));
      if (re) fail("prediction", `a prediction about the reader (${field}): tendencies, not fate`, re.exec(text)?.[0]);
    }
  }

  if (enabled.keyword && input.format === "video" && input.script) {
    const first = words(input.script.toLowerCase().replace(/[.,;:!?«»“”"()]/g, " ")).slice(0, 5).join(" ");
    const keys = keywordsFor(input.card, lang);
    if (!keys.some((k) => first.includes(k))) fail("keyword", `a video says its keyword in the first five words (${keys.join(" or ")})`, first);
  }

  if (enabled.french && lang === "fr") {
    const body = all.filter((t) => !t.field.startsWith("statements")).map((t) => t.text).join(" ");
    const score = frenchScore(body);
    if (body.length > 40 && score.en >= score.fr) fail("french", "this French piece reads as English: French pieces are written in French");
    const tu = /(^|[^\p{L}])(tu|toi|ton|ta|tes|t’|t')(?=[^\p{L}]|$)/iu.exec(body);
    if (tu) fail("french", `"${tu[2]}": French pieces say vous`, tu[2]);
  }

  if (enabled.urls) {
    for (const { field, text } of all) {
      for (const m of text.matchAll(URL_RE)) {
        const url = m[0].replace(/[.,;:!?]+$/, "");
        const ok = input.allowedLinks.some((allowed) => url === allowed || url.startsWith(allowed.split("?")[0] ?? allowed) || allowed.startsWith(url));
        if (!ok) fail("urls", `a link that isn't this piece's own (${field})`, url);
      }
    }
  }

  if (enabled.nogo) {
    for (const { field, text } of all) {
      for (const { subject, re } of NO_GO[lang]) {
        const m = re.exec(text);
        if (m) fail("nogo", `${subject} is a no-go subject (${field})`, m[0]);
      }
    }
  }

  if (input.card.figures.length === 0 && /\d/.test(input.card.hook)) warnings.push({ check: "figures", message: "the hook has a number and the card no figure" });

  return { ok: failures.length === 0, checked_at: now.toISOString(), failures, warnings };
}

/** The failures as the lines a writer's retry is told. */
export function describeFailures(result: GateResult): string[] {
  return result.failures.map((f) => (f.span ? `${f.message} — "${f.span}"` : f.message));
}
