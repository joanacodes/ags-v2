/**
 * "Write it for me": the AI drafts one email from the owner's brief, in the brand's voice and language,
 * as blocks the designer shows at once. Nothing is saved or sent: the owner reads it, changes it, and
 * saves it as a design like any other.
 *
 * The Astro Study's drafts follow the same rules as its posts: the brand kit's voice, the owner's
 * standing rules and the definition library for any astrology they name (ADR-0011). Maison Tarot's
 * follow its own voice from Settings and the rule on sources. Links come only from the brand's own list
 * (or the brief and the current email); a picture is a placeholder the owner fills from Files.
 */
import { z } from "zod/v4";
import type { AgentContext } from "../agents/context";
import { kitForWriter } from "../agents/system";
import { modelCap } from "../caps";
import { callStructured, StructuredCallError } from "../claude/call";
import type { SystemBlock } from "../claude/transport";
import { librarySectionFor } from "../library/library";
import { STANDING_RULES } from "../library/rules";
import { withRun } from "../run";
import type { Language } from "../types";
import { ActionError } from "../views/actions";
import { BRAND_LABELS, blockSchema, newBlockId, type Block, type Brand, type BrandSettings, type DesignContent } from "./model";
import { safeLink } from "./render";

const draftBlock = z.object({
  type: z.enum(["heading", "text", "button", "quote", "image", "divider", "spacer"]),
  /** The words: a title, the paragraphs, a button's label, a quote, or what a picture should show. */
  text: z.string(),
  /** A button's address from the list, or "". */
  href: z.string(),
  /** Who said a quote, or "". */
  cite: z.string(),
  /** 1 for the main title, 2 for a section title; ignored for other blocks. */
  level: z.number(),
});
export const draftOut = z.object({
  subject: z.string().max(200),
  preheader: z.string().max(200),
  blocks: z.array(draftBlock).min(1).max(30),
});
export type DraftOut = z.infer<typeof draftOut>;

const PROMPT = String.raw`You write marketing emails inside the Studio, the owner's marketing hub. You write one email at a time, from the owner's brief, in the brand's voice, in the language you are given.

An email is a list of blocks, from top to bottom:
- heading: a title. level 1 for the email's main title (one at most), 2 for a section title. text is the title.
- text: one or more paragraphs, a blank line between paragraphs. You may use **bold**, *italic* and [words](address) with an address from <links>.
- button: one clear action. text is the label, two to five words; href is an address from <links>, or "" when none fits.
- quote: a sentence set apart. text is the sentence; cite is who said it, a real and named source, or "".
- image: a picture the owner will choose from their own files. text says in a few words what it should show. You never write a picture's address.
- divider: a thin line between two parts.
- spacer: a little breathing room.
For every block, give all five fields; use "" (or level 1) for the ones the block doesn't use.

How to write it:
- A subject under 60 characters, and a preheader under 90 that adds to the subject instead of repeating it.
- Short paragraphs of one to three sentences. One main action per email.
- {{first_name}} puts the reader's first name; use it at most once, as in "Hello {{first_name}}," (a reader without a name then reads "Hello,").
- No invented facts, figures, testimonials, scarcity or deadlines, and no promise of an outcome.
- Only the language you are given.
- When <current_email> is given, keep what the brief doesn't ask to change.`;

const SOURCES_RULE = String.raw`Every fact carries its exact source, and it must be real: a myth, a piece of history, a date, a quotation or a figure is stated only with a precise, checkable source (the author, the work, and the book, chapter or line). If you have no such source, leave the fact out.`;

/** Links the draft may use: the brand's own, and any address in the brief or the current email. */
export function allowedLinks(ctx: AgentContext, brand: Brand, language: Language, brief: string, current: DesignContent | null): string[] {
  const out = new Set<string>();
  if (brand === "astrostudy") for (const pair of Object.values(ctx.kit.links)) if (pair[language]) out.add(pair[language]);
  for (const m of brief.matchAll(/https?:\/\/[^\s)<>"']+/g)) {
    const u = safeLink(m[0]);
    if (u) out.add(u);
  }
  for (const b of current?.blocks ?? []) {
    const href = b.type === "button" || b.type === "image" ? safeLink(b.href) : null;
    if (href) out.add(href);
  }
  return [...out];
}

function systemFor(ctx: AgentContext, brand: Brand, settings: BrandSettings, language: Language): SystemBlock[] {
  const parts = [PROMPT, `<brand>\n${BRAND_LABELS[brand]}\n</brand>`];
  if (settings.voice.trim()) parts.push(`<voice>\n${settings.voice.trim()}\n</voice>`);
  if (brand === "astrostudy") {
    parts.push(`<brand_kit>\n${kitForWriter(ctx.kit, language)}\n</brand_kit>`);
    parts.push(`<standing_rules>\n${STANDING_RULES}\n</standing_rules>`);
  } else {
    parts.push(`<facts>\n${SOURCES_RULE}\n</facts>`);
  }
  return [{ text: parts.join("\n\n"), cache: "5m" }];
}

/** The AI's answer as the designer's blocks: ids added, links outside the list emptied, the rest checked. */
export function toBlocks(out: DraftOut, links: readonly string[]): Block[] {
  const allowed = new Set(links);
  const blocks: Block[] = [];
  for (const b of out.blocks) {
    const id = newBlockId();
    const text = b.text.trim();
    const candidate: Block | null =
      b.type === "heading"
        ? { id, type: "heading", text: text.slice(0, 300), level: b.level === 2 ? 2 : 1, align: "left" }
        : b.type === "text"
          ? { id, type: "text", text: text.slice(0, 5000), align: "left" }
          : b.type === "button"
            ? { id, type: "button", label: text.slice(0, 80), href: allowed.has(safeLink(b.href) ?? "") ? (safeLink(b.href) ?? "") : "", align: "left", style: "solid" }
            : b.type === "quote"
              ? { id, type: "quote", text: text.slice(0, 1000), cite: b.cite.trim().slice(0, 200) }
              : b.type === "image"
                ? { id, type: "image", src: "", alt: text.slice(0, 300), href: "", width: 100, align: "center" }
                : b.type === "divider"
                  ? { id, type: "divider" }
                  : { id, type: "spacer", size: 24 };
    const checked = blockSchema.safeParse(candidate);
    if (checked.success && (b.type === "divider" || b.type === "spacer" || b.type === "image" || text)) blocks.push(checked.data);
  }
  return blocks.slice(0, 60);
}

export interface DraftRequest {
  readonly brief: string;
  readonly language: Language;
  readonly current: DesignContent | null;
}

export async function draftEmail(ctx: AgentContext, brand: Brand, settings: BrandSettings, req: DraftRequest): Promise<{ subject: string; preheader: string; blocks: Block[] }> {
  if (req.brief.trim().length < 5) throw new ActionError("say in a sentence what the email is for");
  if (!ctx.transport) throw new ActionError("the AI needs ANTHROPIC_API_KEY, which isn't set");
  const cap = await modelCap(ctx.store, ctx.settings, "email-draft", ctx.now);
  if (!cap.ok) throw new ActionError(cap.reason ?? "over this week's AI budget");
  const conf = ctx.settings.model("email-draft");
  const links = allowedLinks(ctx, brand, req.language, req.brief, req.current);
  const library = brand === "astrostudy" ? librarySectionFor(req.brief, [req.language]) : null;
  const user = [
    `<language>${req.language === "fr" ? "French" : "English"}</language>`,
    `<brief>\n${req.brief.trim().slice(0, 3000)}\n</brief>`,
    `<links>\n${links.length ? links.join("\n") : "(none: leave every href empty)"}\n</links>`,
    library ? `<library>\nThe definition library's entries for what the brief names. Anything the email says about them agrees with these.\n\n${library}\n</library>` : "",
    req.current ? `<current_email>\n${JSON.stringify({ subject: req.current.subject, preheader: req.current.preheader, blocks: req.current.blocks })}\n</current_email>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let result: { subject: string; preheader: string; blocks: Block[] } | null = null;
  let failure: string | null = null;
  const transport = ctx.transport;
  await withRun(ctx.store, { agent: "interactive", trigger: "interactive", model: conf.model, details: { action: "email-draft", brand } }, async (log) => {
    try {
      const out = await callStructured({
        transport,
        model: conf.model,
        effort: conf.effort,
        maxTokens: conf.max_tokens,
        fallbacks: conf.fallbacks,
        system: systemFor(ctx, brand, settings, req.language),
        user,
        schema: draftOut,
        check: (value) => (toBlocks(value, links).length ? [] : ["the email has no usable block"]),
      });
      log.add(out.usage, out.costUsd, out.model);
      result = { subject: out.value.subject.trim().slice(0, 200), preheader: out.value.preheader.trim().slice(0, 200), blocks: toBlocks(out.value, links) };
      return { outcome: "ok" as const };
    } catch (err) {
      if (err instanceof StructuredCallError) log.add(err.usage, err.costUsd);
      failure = err instanceof Error ? err.message : String(err);
      return { outcome: "failed" as const, error: failure };
    }
  });
  if (!result) throw new ActionError(`the AI couldn't write it: ${failure ?? "no answer"}`, 502);
  return result;
}
