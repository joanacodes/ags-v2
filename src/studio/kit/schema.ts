/**
 * The brand kit's shape. The kit is YAML the owner edits; this schema is what makes an edit safe: a kit
 * that doesn't validate is never saved, and every error names its place in the file.
 */
import { z } from "zod/v4";
import { FORMATS, PILLARS, PLATFORMS } from "../types";

const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
const bilingualList = z.object({ en: z.array(z.string().min(1)), fr: z.array(z.string().min(1)) });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time like 07:30");
const dayTime = z.string().regex(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([01]\d|2[0-3]):[0-5]\d$/, "a day and time like Fri 09:00");
const range = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

const platformSchema = z.object({
  formats: z.array(z.enum(FORMATS)).min(1),
  by_hand: z.boolean().optional(),
  src: z.string().regex(/^[a-z0-9_-]{1,16}$/),
  // One list for every format, or a list per format.
  slots: z.union([z.array(time), z.record(z.string(), z.array(z.union([time, dayTime])))]).optional(),
  max_per_day: z.number().int().min(1).max(50).optional(),
  per_week: z.record(z.string(), z.number().int().min(0)).optional(),
  cta: z.object({ en: z.string(), fr: z.string() }).partial().optional(),
  caption: z
    .object({
      max: z.number().int().positive().optional(),
      lead_max: z.number().int().positive().optional(),
      hashtags: range.optional(),
      topic_tags: z.number().int().min(0).optional(),
      links: z.number().int().min(0).optional(),
    })
    .optional(),
  title: z.object({ max: z.number().int().positive() }).optional(),
  boards: z.object({ en: z.array(z.string()), fr: z.array(z.string()) }).partial().optional(),
  words: range.optional(),
  delay_days: z.number().int().min(0).optional(),
});

const example = z.union([z.string().min(1), z.object({ text: z.string().min(1), why: z.string().min(1) })]);
const examplesPerLanguage = z.object({ good: z.array(example), bad: z.array(example) });

export const kitSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    site: z.string().min(1),
    owner: z.string().min(1),
    signature: bilingual,
    line: bilingual,
    about: bilingual,
    audience: z.string().min(1),
    bio: bilingualList,
  }),
  voice: z.object({ both: z.array(z.string()).min(1), en: z.array(z.string()), fr: z.array(z.string()) }),
  no_go: z.array(z.string().min(1)).min(1),
  pillars: z
    .array(
      z.object({
        id: z.enum(PILLARS),
        share: z.number().min(0).max(100),
        name: z.string().min(1),
        what: z.string().min(1),
        example: z.string().min(1),
      }),
    )
    .min(1),
  languages: z.object({ en: z.array(z.enum(PLATFORMS)), fr: z.array(z.enum(PLATFORMS)) }),
  platforms: z.record(z.enum(PLATFORMS), platformSchema),
  links: z.record(z.string(), bilingual),
  src_tags: z.record(z.string(), z.string()),
  disclosure: z.object({ en: z.string().min(1), fr: z.string().min(1), frame_en: z.string().min(1), frame_fr: z.string().min(1) }),
  calls_to_action: bilingualList,
  saved_replies: z.record(z.string(), bilingual),
  adults_only: bilingual,
  help_lines: bilingual,
  banned_extras: bilingualList,
  tags: z.record(z.string(), z.object({ en: z.array(z.string()), fr: z.array(z.string()) }).partial()),
  hooks: z.object({
    en: z.array(z.object({ text: z.string().min(3), pillar: z.enum(PILLARS) })),
    fr: z.array(z.object({ text: z.string().min(3), pillar: z.enum(PILLARS) })),
  }),
  examples: z.record(z.string(), z.object({ en: examplesPerLanguage, fr: examplesPerLanguage }).partial()),
  calendar: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      event: z.string().min(1),
      note: z.string().optional(),
    }),
  ),
  sky: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: time.optional(),
      kind: z.enum(["ingress", "station", "lunation", "eclipse"]),
      body: z.string().min(1),
      sign: z.string().optional(),
      event: z.string().min(1),
      approx: z.boolean().optional(),
    }),
  ),
  scorecard: z.object({
    targets: z.record(z.string(), z.union([z.number(), range])),
    rules: z.object({
      cross_post_only: z.object({ tests_share_below: z.number(), engagement_share_below: z.number() }),
      repeat_hook: z.object({ multiple_of_median: z.number(), variants: z.number().int() }),
      paid_push: z.object({ comment_rate_above: z.number(), completion_above: z.number() }),
      rewrite_email: z.object({ click_below: z.number() }),
      raise_cap: z.object({ cap_days_per_week: z.number().int() }),
      pull_product: z.object({ weeks_without_sale: z.number().int() }),
    }),
    paid: z.object({
      daily_gbp: z.number(),
      stop_cost_per_test_gbp: z.number(),
      stop_after_days: z.number().int(),
      stop_conversion_below: z.number(),
    }),
  }),
  legal: bilingual,
});

export type Kit = z.infer<typeof kitSchema>;
export type KitPlatform = z.infer<typeof platformSchema>;
export type KitExample = z.infer<typeof example>;
