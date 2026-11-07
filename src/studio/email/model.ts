/**
 * The Studio's own email (TASK-0017): one space per brand, never shared. A brand has its settings (who
 * sends, the footer, the look, the voice the AI writes in), its designs (emails built from blocks), its
 * workflows (what is sent when, to whom) and its contacts (who agreed to receive them, and how).
 *
 * Pure: the shapes, their checks (ADR-0009) and the defaults. The screens, the routes and the stores all
 * read the same shapes from here.
 */
import { z } from "zod/v4";
import { LANGUAGES, type Language } from "../types";

export const BRANDS = ["astrostudy", "maison-tarot"] as const;
export type Brand = (typeof BRANDS)[number];
export const BRAND_LABELS: Readonly<Record<Brand, string>> = { astrostudy: "The Astro Study", "maison-tarot": "Maison Tarot" };
export const isBrand = (v: unknown): v is Brand => typeof v === "string" && (BRANDS as readonly string[]).includes(v);

/* ------------------------------------------------------------------ looks */

/** Fonts every email program has: a web font would show in a few and fall back everywhere else. */
export const FONT_STACKS = {
  georgia: { label: "Georgia (serif)", stack: "Georgia, 'Times New Roman', Times, serif" },
  palatino: { label: "Palatino (serif)", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  helvetica: { label: "Helvetica (sans-serif)", stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  verdana: { label: "Verdana (sans-serif, wide)", stack: "Verdana, Geneva, Tahoma, sans-serif" },
  trebuchet: { label: "Trebuchet (sans-serif, soft)", stack: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif" },
  mono: { label: "Courier (typewriter)", stack: "'Courier New', Courier, monospace" },
} as const;
export type FontKey = keyof typeof FONT_STACKS;
export const FONT_KEYS = Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #b5512c");
const short = (max: number) => z.string().max(max);

export const colorsSchema = z.object({ page: hex, card: hex, text: hex, muted: hex, accent: hex, button_text: hex });
export type Colors = z.infer<typeof colorsSchema>;
const fontsSchema = z.object({ heading: z.enum(FONT_KEYS), body: z.enum(FONT_KEYS) });
const footerNoteSchema = z.object({ en: short(400), fr: short(400) });

/** Who sends, the footer the law asks for, the look, and the voice the AI writes in. */
export const brandSettingsSchema = z.object({
  sender_name: short(80),
  sender_email: short(200),
  reply_to: short(200),
  /** Where "Send me a test" goes; empty means the owner's address from Settings. */
  test_email: short(200),
  footer_address: short(300),
  footer_note: footerNoteSchema,
  logo_url: short(2000),
  colors: colorsSchema,
  fonts: fontsSchema,
  voice: short(3000),
});
export type BrandSettings = z.infer<typeof brandSettingsSchema>;

export const DEFAULT_BRAND_SETTINGS: Readonly<Record<Brand, BrandSettings>> = {
  // The Studio's own palette is The Astro Study's (tailwind.studio.config.ts): paper, ink and terracotta.
  astrostudy: {
    sender_name: "The Astro Study",
    sender_email: "",
    reply_to: "",
    test_email: "",
    footer_address: "",
    footer_note: {
      en: "You're receiving this because you signed up at astrostudy.co.uk.",
      fr: "Vous recevez cet e-mail car vous vous êtes inscrit·e sur astrostudy.co.uk.",
    },
    logo_url: "",
    colors: { page: "#f3f1ea", card: "#faf9f5", text: "#1c211b", muted: "#6b7268", accent: "#b5512c", button_text: "#ffffff" },
    fonts: { heading: "georgia", body: "helvetica" },
    voice: "Warm, plain and precise. Curious rather than mystical; never fortune-telling, never fear. Short sentences, no jargon a newcomer wouldn't know.",
  },
  // Maison Tarot's site: black on white, a gold accent, a grotesque for titles.
  "maison-tarot": {
    sender_name: "Maison Tarot",
    sender_email: "",
    reply_to: "",
    test_email: "",
    footer_address: "",
    footer_note: {
      en: "You're receiving this because you signed up with Maison Tarot.",
      fr: "Vous recevez cet e-mail car vous vous êtes inscrit·e auprès de Maison Tarot.",
    },
    logo_url: "",
    colors: { page: "#f4f4f4", card: "#ffffff", text: "#0a0a0a", muted: "#707070", accent: "#a88c52", button_text: "#0a0a0a" },
    fonts: { heading: "helvetica", body: "helvetica" },
    voice: "Calm, elegant and exact. The cards as images and stories, never as fate. Short sentences.",
  },
};

/** A nested group (the colours, the fonts, the footer notes) field by field over its defaults. */
function groupOf<T extends Record<string, unknown>>(schema: { readonly shape: Readonly<Record<string, z.ZodType | undefined>> }, defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return defaults;
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const field = schema.shape[key];
    const one = field ? field.safeParse((stored as Record<string, unknown>)[key]) : null;
    if (one?.success) out[key] = one.data;
  }
  return out as T;
}

/** Stored settings over the brand's defaults, field by field: a missing or broken field keeps its default. */
export function brandSettingsOf(brand: Brand, stored: unknown): BrandSettings {
  const base = DEFAULT_BRAND_SETTINGS[brand];
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Record<string, unknown>;
  const plain = groupOf(brandSettingsSchema.omit({ colors: true, fonts: true, footer_note: true }), { ...base }, s);
  return {
    ...plain,
    colors: groupOf(colorsSchema, base.colors, s.colors),
    fonts: groupOf(fontsSchema, base.fonts, s.fonts),
    footer_note: groupOf(footerNoteSchema, base.footer_note, s.footer_note),
  };
}

/* ----------------------------------------------------------------- blocks */

const blockId = z.string().regex(/^[a-z0-9-]{4,40}$/);
const align = z.enum(["left", "center", "right"]);

export const BLOCK_TYPES = ["heading", "text", "image", "button", "split", "quote", "divider", "spacer"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: blockId, type: z.literal("heading"), text: short(300), level: z.union([z.literal(1), z.literal(2)]), align }),
  z.object({ id: blockId, type: z.literal("text"), text: short(5000), align }),
  z.object({ id: blockId, type: z.literal("image"), src: short(2000), alt: short(300), href: short(2000), width: z.number().int().min(20).max(100), align }),
  z.object({ id: blockId, type: z.literal("button"), label: short(80), href: short(2000), align, style: z.enum(["solid", "outline"]) }),
  z.object({ id: blockId, type: z.literal("split"), src: short(2000), alt: short(300), text: short(3000), side: z.enum(["left", "right"]) }),
  z.object({ id: blockId, type: z.literal("quote"), text: short(1000), cite: short(200) }),
  z.object({ id: blockId, type: z.literal("divider") }),
  z.object({ id: blockId, type: z.literal("spacer"), size: z.number().int().min(8).max(96) }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const BLOCK_LABELS: Readonly<Record<BlockType, { label: string; hint: string }>> = {
  heading: { label: "Title", hint: "A heading, large or medium" },
  text: { label: "Text", hint: "Paragraphs; **bold**, *italic*, [a link](https://…)" },
  image: { label: "Picture", hint: "From Files or any https address" },
  button: { label: "Button", hint: "One clear action" },
  split: { label: "Picture and text", hint: "Side by side; stacked on a phone" },
  quote: { label: "Quote", hint: "A sentence set apart, with who said it" },
  divider: { label: "Line", hint: "A thin rule between parts" },
  spacer: { label: "Space", hint: "Breathing room" },
};

export function newBlockId(): string {
  return `b-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function newBlock(type: BlockType, language: Language = "en"): Block {
  const id = newBlockId();
  const fr = language === "fr";
  switch (type) {
    case "heading":
      return { id, type, text: fr ? "Votre titre" : "Your title", level: 1, align: "left" };
    case "text":
      return { id, type, text: fr ? "Écrivez votre message ici." : "Write your message here.", align: "left" };
    case "image":
      return { id, type, src: "", alt: "", href: "", width: 100, align: "center" };
    case "button":
      return { id, type, label: fr ? "Découvrir" : "Find out more", href: "", align: "left", style: "solid" };
    case "split":
      return { id, type, src: "", alt: "", text: fr ? "Quelques lignes à côté de l'image." : "A few lines beside the picture.", side: "left" };
    case "quote":
      return { id, type, text: fr ? "Une phrase qui compte." : "A sentence that matters.", cite: "" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: 24 };
  }
}

/* ---------------------------------------------------------------- designs */

export const designContentSchema = z.object({
  name: z.string().trim().min(1, "give it a name").max(80),
  subject: short(200),
  preheader: short(200),
  language: z.enum(LANGUAGES),
  blocks: z.array(blockSchema).max(60, "60 blocks at most"),
});
export type DesignContent = z.infer<typeof designContentSchema>;

export const STARTERS = ["blank", "newsletter", "announcement"] as const;
export type Starter = (typeof STARTERS)[number];
export const STARTER_LABELS: Readonly<Record<Starter, string>> = { blank: "Blank", newsletter: "Newsletter", announcement: "Announcement" };

export function starterDesign(starter: Starter, language: Language, name: string): DesignContent {
  const b = (t: BlockType) => newBlock(t, language);
  const blocks: Block[] =
    starter === "blank"
      ? [b("heading"), b("text")]
      : starter === "newsletter"
        ? [b("heading"), b("text"), b("image"), b("text"), b("divider"), b("split"), b("button")]
        : [b("image"), b("heading"), b("text"), b("button")];
  return { name, subject: "", preheader: "", language, blocks };
}

/* -------------------------------------------------------------- workflows */

export const WORKFLOW_STATUSES = ["draft", "paused", "on"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

const tag = z.string().trim().max(40).regex(/^[\p{L}\p{N} _-]*$/u, "letters, numbers, spaces and dashes");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time like 09:00");

export const triggerSchema = z.discriminatedUnion("type", [
  /** Someone joins the list (from any form, or from the ones named). */
  z.object({ type: z.literal("signup"), sources: z.array(tag).max(10) }),
  /** A tag is added to someone. */
  z.object({ type: z.literal("tag"), tag }),
  /** Someone finishes The Astro Study's test and ticked the news box. */
  z.object({ type: z.literal("test-finished") }),
  /** Once, at a date and time (Paris), to everyone the audience covers: a newsletter. */
  z.object({ type: z.literal("once"), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "a date and time") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;
export type TriggerType = Trigger["type"];

export const TRIGGER_LABELS: Readonly<Record<TriggerType, string>> = {
  signup: "Someone joins the list",
  tag: "A tag is added to someone",
  "test-finished": "Someone finishes the test",
  once: "Once, at a date and time",
};

export const stepSchema = z.discriminatedUnion("type", [
  /** An email: a design as it is, or written by the AI from a brief (in the design's layout, if one is chosen). */
  z.object({ id: blockId, type: z.literal("send"), design_id: z.string().max(64).nullable(), ai: z.boolean(), brief: short(2000) }),
  z.object({ id: blockId, type: z.literal("wait"), amount: z.number().int().min(1).max(365), unit: z.enum(["hours", "days"]) }),
  /** Only the people this rule keeps go on; the others leave the workflow. */
  z.object({ id: blockId, type: z.literal("filter"), rule: z.enum(["opened-last", "clicked-last", "has-tag", "lacks-tag"]), tag }),
  z.object({ id: blockId, type: z.literal("tag"), action: z.enum(["add", "remove"]), tag }),
]);
export type Step = z.infer<typeof stepSchema>;
export type StepType = Step["type"];

export const STEP_LABELS: Readonly<Record<StepType, { label: string; hint: string }>> = {
  send: { label: "Send an email", hint: "A design, or one the AI writes" },
  wait: { label: "Wait", hint: "Hours or days" },
  filter: { label: "Only if…", hint: "Opened, clicked, or has a tag" },
  tag: { label: "Tag", hint: "Add or remove a tag" },
};

export function newStep(type: StepType): Step {
  const id = newBlockId();
  switch (type) {
    case "send":
      return { id, type, design_id: null, ai: false, brief: "" };
    case "wait":
      return { id, type, amount: 2, unit: "days" };
    case "filter":
      return { id, type, rule: "opened-last", tag: "" };
    case "tag":
      return { id, type, action: "add", tag: "" };
  }
}

export const workflowSettingsSchema = z.object({
  /** "contact": each person in their own language. */
  language: z.enum(["contact", ...LANGUAGES] as const),
  audience: z.object({ tags_any: z.array(tag).max(20), tags_none: z.array(tag).max(20) }),
  /** When emails may go out, Paris time; days are 1 (Monday) to 7 (Sunday). */
  window: z.object({ from: clock, to: clock, days: z.array(z.number().int().min(1).max(7)).min(1).max(7) }),
  max_per_week: z.number().int().min(1).max(14),
  ai: z.object({ tone: short(300), length: z.enum(["short", "medium", "long"]), approval: z.enum(["every", "first"]) }),
});
export type WorkflowSettings = z.infer<typeof workflowSettingsSchema>;

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  language: "contact",
  audience: { tags_any: [], tags_none: [] },
  window: { from: "09:00", to: "20:00", days: [1, 2, 3, 4, 5, 6, 7] },
  max_per_week: 3,
  ai: { tone: "", length: "medium", approval: "every" },
};

export const workflowContentSchema = z.object({
  name: z.string().trim().min(1, "give it a name").max(80),
  trigger: triggerSchema,
  steps: z.array(stepSchema).max(40, "40 steps at most"),
  settings: workflowSettingsSchema,
});
export type WorkflowContent = z.infer<typeof workflowContentSchema>;

export function newWorkflow(name: string, brand: Brand): WorkflowContent {
  return {
    name,
    trigger: brand === "astrostudy" ? { type: "test-finished" } : { type: "signup", sources: [] },
    steps: [newStep("send"), newStep("wait"), newStep("send")],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };
}

/** What would stop a workflow from running, in plain words. */
export function workflowProblems(content: WorkflowContent, designIds: ReadonlySet<string>, now: Date = new Date()): string[] {
  const problems: string[] = [];
  const sends = content.steps.filter((s): s is Extract<Step, { type: "send" }> => s.type === "send");
  if (!sends.length) problems.push("It sends nothing yet: add a “Send an email” step.");
  sends.forEach((s, i) => {
    const n = sends.length > 1 ? ` ${i + 1}` : "";
    if (!s.ai && !s.design_id) problems.push(`Email${n}: choose a design, or let the AI write it.`);
    if (s.design_id && !designIds.has(s.design_id)) problems.push(`Email${n}: its design was deleted.`);
    if (s.ai && s.brief.trim().length < 5) problems.push(`Email${n}: tell the AI in a sentence what to write.`);
  });
  for (const s of content.steps) if ((s.type === "filter" && (s.rule === "has-tag" || s.rule === "lacks-tag")) || s.type === "tag") if (!s.tag.trim()) problems.push("A step needs its tag.");
  if (content.trigger.type === "tag" && !content.trigger.tag.trim()) problems.push("The trigger needs its tag.");
  if (content.trigger.type === "once" && Date.parse(`${content.trigger.at}:00Z`) < now.getTime() - 24 * 3600_000) problems.push("Its date has passed.");
  return problems;
}

/** A trigger the brand can't have (the test is The Astro Study's). */
export function triggerProblem(brand: Brand, trigger: Trigger): string | null {
  if (trigger.type === "test-finished" && brand !== "astrostudy") return "only The Astro Study has the test";
  return null;
}

/* --------------------------------------------------------------- contacts */

export const CONTACT_STATUSES = ["pending", "subscribed", "unsubscribed", "bounced", "complained"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Readonly<Record<ContactStatus, string>> = {
  pending: "Waiting for confirmation",
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Address bounced",
  complained: "Marked as spam",
};

/** Only these receive a workflow's emails. */
export const SENDABLE: readonly ContactStatus[] = ["subscribed"];

export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i, "an email address like name@example.com");

export const newContactSchema = z.object({
  email: emailAddress,
  name: short(120),
  language: z.enum(LANGUAGES),
  tags: z.array(tag).max(20),
  source: short(80),
  /** How they agreed: the form's words, or what the owner attests for a contact added by hand. */
  consent_text: z.string().trim().min(3, "say how they agreed").max(500),
});
export type NewContact = z.infer<typeof newContactSchema>;

/** Tags as people type them: trimmed, lower case, no duplicates, empty ones dropped. */
export function cleanTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 20);
}

export interface ImportedRow {
  readonly email: string;
  readonly name: string;
  readonly language: Language;
  readonly tags: string[];
}

/**
 * Contacts pasted as lines or CSV: an email address per line, then (comma, semicolon or tab separated)
 * a name, a language (en or fr) and tags separated by "|". A header line is skipped; a line without a
 * valid address is reported, never guessed.
 */
export function parseContactsCsv(text: string, fallbackLanguage: Language): { rows: ImportedRow[]; problems: string[] } {
  const rows: ImportedRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const email = emailAddress.safeParse(cells[0] ?? "");
    if (!email.success) {
      if (i === 0 && /mail/i.test(cells[0] ?? "")) return; // a header
      problems.push(`line ${i + 1}: “${(cells[0] ?? "").slice(0, 60)}” is not an email address`);
      return;
    }
    if (seen.has(email.data)) return;
    seen.add(email.data);
    const lang = (cells[2] ?? "").toLowerCase();
    rows.push({
      email: email.data,
      name: (cells[1] ?? "").slice(0, 120),
      language: lang === "fr" || lang === "en" ? lang : fallbackLanguage,
      tags: cleanTags((cells[3] ?? "").split("|")),
    });
  });
  return { rows, problems };
}
