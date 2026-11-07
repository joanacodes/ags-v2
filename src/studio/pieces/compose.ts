/**
 * From what a writer wrote to what a platform receives. The writer writes the words; the code adds the
 * mechanical parts the same way every time: the test link with its src tag where a link belongs, the
 * AI-voice disclosure on voiced pieces, the call to action the platform uses, the hashtags in the
 * number the kit allows. A model is never trusted to remember any of these.
 */
import type { Kit } from "../kit/schema";
import type { PieceOut } from "../prompts/schemas";
import type { Format, Language, Platform } from "../types";
import { BY_HAND_PLATFORMS } from "../types";
import { testLink } from "../kit/load";
import type { GateInput } from "../gate/text";
import type { NewPost } from "../store/store";
import type { CardRow, PostRow } from "../store/rows";

const VOICED: ReadonlySet<Format> = new Set(["video", "long_video"]);
const LINK_IN_TEXT: ReadonlySet<Platform> = new Set(["threads", "bluesky", "x", "mastodon", "facebook"]);

export interface ComposeContext {
  readonly kit: Kit;
  /** False before the keyword date: no "comment TEST" anywhere yet (the warm-up). */
  readonly keywordActive: boolean;
}

function hashtag(tag: string): string {
  const t = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return t ? `#${t}` : "";
}

/** The tags in the kit's number for the platform: trimmed when too many, topped up from the kit's list. */
export function settleTags(kit: Kit, platform: Platform, language: Language, proposed: readonly string[]): string[] {
  const conf = kit.platforms[platform];
  if (platform === "threads") {
    const topic = (proposed[0] ?? kit.tags["threads"]?.[language]?.[0] ?? "").replace(/^#/, "").replace(/\s+/g, "");
    return topic ? [topic] : [];
  }
  const range = conf?.caption?.hashtags;
  if (!range) return [];
  const [min, max] = range;
  const out: string[] = [];
  for (const t of proposed.map(hashtag).filter(Boolean)) if (!out.includes(t) && out.length < max) out.push(t);
  for (const t of (kit.tags[platform]?.[language] ?? []).map(hashtag)) {
    if (out.length >= min) break;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function stripKeywordCta(text: string): string {
  return text
    .replace(/\b(?:comment|reply|commentez|répondez)\s+TEST\b[.!]?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function composePiece(raw: PieceOut, card: Pick<CardRow, "id" | "anchor">, language: Language, ctx: ComposeContext): NewPost {
  const { kit } = ctx;
  const platform = raw.platform;
  const format = raw.format;
  const voiced = VOICED.has(format) && !!raw.script?.trim();
  const link = testLink(kit, language, platform);
  const tags = settleTags(kit, platform, language, raw.tags);
  const ctaPlatform = kit.platforms[platform]?.cta?.[language];
  const clean = (t: string | null) => (t && !ctx.keywordActive ? stripKeywordCta(t) : t);

  let caption = clean(raw.caption)?.trim() ?? null;
  let description = clean(raw.description)?.trim() ?? null;
  const script = clean(raw.script)?.trim() ?? null;

  if (platform === "youtube") {
    const body = description ?? caption ?? "";
    description = [body, link, voiced ? kit.disclosure[language] : null, tags.join(" ") || null].filter(Boolean).join("\n\n");
    caption = null;
  } else if (platform === "pinterest") {
    // A pin's link is its destination, not text: it rides in the spec.
    caption = null;
  } else if (platform === "substack" || platform === "medium") {
    description = [description ?? "", `${language === "fr" ? "Le test" : "The test"}: ${link}`].join("\n\n");
  } else if (caption !== null || voiced) {
    const parts = [caption ?? ""];
    const wantsCta = ctaPlatform && (ctx.keywordActive || !/TEST/.test(ctaPlatform));
    if (wantsCta && !(caption ?? "").toLowerCase().includes(ctaPlatform.toLowerCase())) parts.push(ctaPlatform);
    if (LINK_IN_TEXT.has(platform) && raw.link) parts.push(link);
    if (voiced) parts.push(kit.disclosure[language]);
    if (platform !== "threads" && tags.length) parts.push(tags.join(" "));
    caption = parts.filter((p) => p.trim()).join("\n\n");
  }

  const spec: Record<string, unknown> = { kind: VOICED.has(format) ? "video" : "picture" };
  if (VOICED.has(format)) {
    spec["template"] = raw.template ?? (raw.statements?.length ? "test-three-cards" : "meadow-text");
    if (raw.statements?.length) spec["statements"] = raw.statements;
  } else if (format === "pin") {
    spec["template"] = "pin";
    spec["link"] = link;
  } else if (format === "carousel" || format === "story" || format === "still") {
    spec["template"] = format;
  }

  return {
    card_id: card.id,
    platform,
    format,
    language,
    script,
    lines: raw.lines ? raw.lines.map((l) => l.trim()).filter(Boolean) : null,
    caption,
    title: raw.title?.trim() ?? null,
    description,
    tags,
    slides: raw.slides ?? null,
    spec,
    disclosure: voiced,
    status: "draft",
    by_hand: !!kit.platforms[platform]?.by_hand || BY_HAND_PLATFORMS.has(platform),
  };
}

/** What the gate checks for a stored or composed piece. */
export function gateInputOf(
  post: Pick<PostRow, "platform" | "format" | "language" | "script" | "lines" | "caption" | "title" | "description" | "tags" | "slides" | "disclosure" | "spec">,
  card: Pick<CardRow, "hook" | "figures" | "anchor">,
  kit: Kit,
): GateInput {
  const spec = (post.spec ?? {}) as { statements?: unknown };
  const statements = Array.isArray(spec.statements) ? spec.statements.filter((s): s is string => typeof s === "string") : undefined;
  const allowed = [testLink(kit, post.language, post.platform), ...Object.values(kit.links).map((l) => l[post.language])];
  return {
    platform: post.platform,
    format: post.format,
    language: post.language,
    script: post.script,
    lines: post.lines,
    caption: post.caption,
    title: post.title,
    description: post.description,
    tags: post.tags,
    slides: post.slides,
    disclosure: post.disclosure,
    statements,
    card: { hook: card.hook, figures: card.figures, anchor: card.anchor },
    allowedLinks: allowed,
  };
}
