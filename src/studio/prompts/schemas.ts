/**
 * What each agent must hand back. These zod schemas become the JSON schema the model's output is held to
 * (claude/schema.ts) and are checked again on the answer, so a malformed card or piece never reaches a
 * table. The same shapes are shown, editable, on Settings → Prompts beside each prompt's text.
 */
import { z } from "zod/v4";
import { CARD_LANGUAGES, PILLARS, PLATFORMS, REPLY_CLASSES, REPLY_FLAGS } from "../types";
import { figureSchema, slideSchema } from "../store/rows";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-11-16");

/** The create_reminder tool of the build prompt, as a field every agent's answer may carry. */
export const reminderOut = z.object({
  title: z.string().min(3).max(120),
  body: z.string().max(600),
  due_at: z.string().describe("ISO 8601 date and time in Paris time, e.g. 2026-11-16T09:00"),
  channels: z.array(z.enum(["in_app", "email"])).max(2),
  reason: z.string().min(3).max(300),
});
export type ReminderOut = z.infer<typeof reminderOut>;

export const CARD_FORMATS = ["video", "carousel", "text", "pin", "story", "issue"] as const;

export const cardOut = z.object({
  pillar: z.enum(PILLARS),
  language: z.enum(CARD_LANGUAGES),
  idea: z.string().min(3).max(300),
  hook: z.string().min(3).max(220),
  points: z.array(z.string().min(2).max(240)).min(2).max(4),
  figures: z.array(figureSchema).max(3),
  cta: z.string().min(2).max(120),
  anchor: z.string().max(40).nullable(),
  sky_date: date.nullable(),
  formats: z.array(z.enum(CARD_FORMATS)).min(1).max(6),
  variant_of: z.string().max(220).nullable().describe("the hook this card is a declared variant of, word for word, or null"),
  reason: z.string().min(3).max(240),
});
export type CardOut = z.infer<typeof cardOut>;

export const strategistOut = z.object({
  cards: z.array(cardOut).min(1).max(90),
  reminders: z.array(reminderOut).max(3),
});
export type StrategistOut = z.infer<typeof strategistOut>;

export const VIDEO_TEMPLATES = ["meadow-text", "test-three-cards", "placement-callout", "figure-card", "sky-this-week"] as const;

export const pieceOut = z.object({
  platform: z.enum(PLATFORMS),
  format: z.enum(["video", "carousel", "text", "pin", "still", "story", "issue", "long_video", "article"]),
  script: z.string().max(12000).nullable().describe("what the voice says, for video formats; null otherwise"),
  lines: z.array(z.string().max(80)).max(12).nullable().describe("the on-screen lines of a video or story, in order"),
  caption: z.string().max(3000).nullable().describe("the post's text without the link, the disclosure or the hashtags: the code adds those"),
  title: z.string().max(140).nullable(),
  description: z.string().max(12000).nullable(),
  tags: z.array(z.string().max(40)).max(8),
  slides: z.array(slideSchema).max(10).nullable(),
  statements: z.array(z.string().max(400)).max(3).nullable().describe("for a test-format video: three short descriptions A, B, C of one part of a life, with no astrology word"),
  template: z.enum(VIDEO_TEMPLATES).nullable(),
  link: z.boolean().describe("true when this piece should carry the test link (text posts only; the code adds it)"),
});
export type PieceOut = z.infer<typeof pieceOut>;

export const writerOut = z.object({ pieces: z.array(pieceOut).min(1).max(30) });
export type WriterOut = z.infer<typeof writerOut>;

export const classifyOut = z.object({
  items: z.array(
    z.object({
      ref: z.string(),
      klass: z.enum(REPLY_CLASSES),
      language: z.enum(["en", "fr", "other"]),
    }),
  ),
});
export type ClassifyOut = z.infer<typeof classifyOut>;

export const draftOut = z.object({
  reply: z.string().max(600).describe("at most 60 words, in the person's language"),
  flag: z.enum(REPLY_FLAGS),
  flag_reason: z.string().max(300).nullable(),
  reminders: z.array(reminderOut).max(1),
});
export type DraftOut = z.infer<typeof draftOut>;

export const analystOut = z.object({
  verdicts: z.array(z.object({ rule: z.string(), wording: z.string().max(400) })).max(12),
  suggestions: z
    .array(
      z.object({
        idea: z.string().min(3).max(300),
        pillar: z.enum(PILLARS),
        figure: z.string().max(200).nullable(),
        reason: z.string().min(3).max(300),
      }),
    )
    .max(10),
  for_owner: z.array(z.string().min(3).max(400)).min(1).max(3),
  reminders: z.array(reminderOut).max(3),
});
export type AnalystOut = z.infer<typeof analystOut>;
