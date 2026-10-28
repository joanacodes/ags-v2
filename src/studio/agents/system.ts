/**
 * The cached system block of each agent: its prompt, then the parts of the kit it needs, the platform
 * rules and the examples, in a fixed order. Everything here is the same for every call of a run (and of
 * the week), so it is written once to the prompt cache and read back at a tenth of the price; anything
 * that varies per call goes in the user message instead.
 */
import { stringify } from "yaml";
import type { Kit, KitExample } from "../kit/schema";
import type { Format, Language, Platform } from "../types";
import { PLATFORM_LABELS } from "../types";
import type { SystemBlock } from "../claude/transport";
import { lengthRule, keywordsFor } from "../gate/text";
import { slotsFor } from "../kit/load";

function section(title: string, body: string): string {
  return `<${title}>\n${body.trim()}\n</${title}>`;
}

function pick<K extends keyof Kit>(kit: Kit, keys: readonly K[]): Pick<Kit, K> {
  const out = {} as Pick<Kit, K>;
  for (const k of keys) out[k] = kit[k];
  return out;
}

export function kitForStrategist(kit: Kit): string {
  return stringify(pick(kit, ["brand", "voice", "no_go", "pillars", "languages", "calls_to_action", "src_tags", "scorecard"]), { lineWidth: 0 });
}

export function kitForWriter(kit: Kit, language: Language): string {
  const voice = { both: kit.voice.both, [language]: kit.voice[language] };
  return stringify(
    {
      brand: { name: kit.brand.name, site: kit.brand.site, signature: kit.brand.signature[language], line: kit.brand.line[language], about: kit.brand.about[language] },
      voice,
      no_go: kit.no_go,
      calls_to_action: kit.calls_to_action[language],
      banned_words: kit.banned_extras[language],
    },
    { lineWidth: 0 },
  );
}

/** One paragraph per platform and format a writer may be asked for, with the numbers the gate checks. */
export function formatSheet(kit: Kit, language: Language): string {
  const lines: string[] = [];
  for (const platform of kit.languages[language] as Platform[]) {
    const conf = kit.platforms[platform];
    if (!conf) continue;
    for (const format of conf.formats as Format[]) {
      const rule = lengthRule(kit, platform, format);
      const parts: string[] = [];
      if (rule.scriptWords) parts.push(`script ${rule.scriptWords[0]}–${rule.scriptWords[1]} words`);
      if (rule.lineWords) parts.push(`on-screen lines of ${rule.lineWords} words at most${rule.maxLines ? `, ${rule.maxLines} lines at most` : ""}`);
      if (rule.captionMax) parts.push(`caption up to ${rule.captionMax} characters (the code adds the link, the disclosure and the hashtags after it, so leave room)`);
      if (rule.leadMax) parts.push(`the caption's first line under ${rule.leadMax} characters, starting with the keyword`);
      if (rule.titleMax) parts.push(`title under ${rule.titleMax} characters`);
      if (rule.descriptionMax) parts.push(`description under ${rule.descriptionMax} characters`);
      if (rule.slides) parts.push(`${rule.slides[0]}–${rule.slides[1]} slides of ${rule.slideWords ?? 20} words at most`);
      if (rule.hashtags) parts.push(rule.hashtags[1] === 0 ? "no hashtags" : `${rule.hashtags[0]}–${rule.hashtags[1]} hashtags`);
      if (rule.topicTags !== undefined) parts.push(`${rule.topicTags} topic tag (one word, no #)`);
      if (rule.bodyWords) parts.push(`${rule.bodyWords[0]}–${rule.bodyWords[1]} words`);
      if (rule.keywordTwice) parts.push(`the keyword (${keywordsFor({ anchor: null }, language).join(" or ")}, or the card's anchor) in the title and twice in the description`);
      const cta = conf.cta?.[language];
      if (cta) parts.push(`call to action: "${cta}"`);
      const tags = kit.tags[platform]?.[language];
      if (tags?.length) parts.push(`tags to choose from: ${tags.join(" ")}`);
      const slots = slotsFor(kit, platform, format);
      if (slots.length) parts.push(`posted at ${slots.join(", ")} Paris time`);
      if (conf.by_hand) parts.push("posted by Joana by hand");
      lines.push(`- ${format} on ${PLATFORM_LABELS[platform]}: ${parts.join("; ")}.`);
    }
  }
  return lines.join("\n");
}

function exampleText(ex: KitExample): string {
  return typeof ex === "string" ? ex : `${ex.text}\n  (Why it fails: ${ex.why})`;
}

export function examplesFor(kit: Kit, language: Language): string {
  const out: string[] = [];
  for (const [format, byLang] of Object.entries(kit.examples)) {
    const ex = byLang[language];
    if (!ex) continue;
    out.push(`## ${format}\nGood:\n${ex.good.map((e) => `- ${exampleText(e)}`).join("\n")}\nBad:\n${ex.bad.map((e) => `- ${exampleText(e)}`).join("\n")}`);
  }
  return out.join("\n\n");
}

export function strategistSystem(prompt: string, kit: Kit): SystemBlock[] {
  return [{ text: [prompt, section("kit", kitForStrategist(kit))].join("\n\n"), cache: "1h" }];
}

export function writerSystem(prompt: string, kit: Kit, language: Language): SystemBlock[] {
  return [
    {
      text: [prompt, section("kit", kitForWriter(kit, language)), section("platform_rules", formatSheet(kit, language)), section("examples", examplesFor(kit, language))].join("\n\n"),
      // The Sunday run calls the writers about fifty times within the hour: the 1-hour cache pays for itself.
      cache: "1h",
    },
  ];
}

export function communitySystem(prompt: string, kit: Kit): SystemBlock[] {
  return [
    {
      text: [
        prompt,
        section(
          "kit",
          stringify(
            { brand: { name: kit.brand.name, owner: kit.brand.owner }, voice: kit.voice, no_go: kit.no_go, saved_replies: kit.saved_replies, help_lines: kit.help_lines, adults_only: kit.adults_only },
            { lineWidth: 0 },
          ),
        ),
      ].join("\n\n"),
      cache: "5m",
    },
  ];
}

export function analystSystem(prompt: string, kit: Kit): SystemBlock[] {
  return [{ text: [prompt, section("kit", stringify(pick(kit, ["brand", "voice", "no_go", "pillars", "scorecard"]), { lineWidth: 0 }))].join("\n\n") }];
}
