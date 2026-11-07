/**
 * What picture a piece becomes: a carousel's slides, a pin, the still a text post carries, a story.
 * Everything a model wrote is escaped here: the templates take HTML, the pieces are text.
 */
import type { CardRow, PostRow } from "../store/rows";
import type { PictureJob } from "./templates";
import { esc } from "./templates";
import { PILLAR_LABELS } from "../types";

const PILLAR_FR: Record<string, string> = { test: "Le test", placements: "Les placements, en mots simples", tested: "Testé d’abord", sky: "Le ciel de la semaine" };

const GLYPHS: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇", chiron: "⚷", lilith: "⚸",
  soleil: "☉", lune: "☽", mercure: "☿", vénus: "♀", saturne: "♄", pluton: "♇",
};

export function glyphFor(anchor: string | null): string | undefined {
  if (!anchor) return undefined;
  return GLYPHS[anchor.toLowerCase().split(/\s+/)[0] ?? ""];
}

const firstSentence = (text: string | null) => (text ?? "").split(/(?<=[.!?])\s+/)[0] ?? "";

/** Platforms whose text posts carry a still (the format table: Facebook, X, Bluesky, Mastodon). */
export { STILL_PLATFORMS } from "../render/need";

export function pictureJob(post: Pick<PostRow, "format" | "platform" | "language" | "slides" | "title" | "description" | "lines" | "caption">, card: Pick<CardRow, "pillar" | "hook" | "anchor">): PictureJob | null {
  const lang = post.language;
  const label = esc(lang === "fr" ? PILLAR_FR[card.pillar] : PILLAR_LABELS[card.pillar]);
  const glyph = glyphFor(card.anchor);
  switch (post.format) {
    case "carousel": {
      const slides = post.slides ?? [];
      if (slides.length < 2) return null;
      return {
        template: "carousel",
        lang,
        slides: slides.map((s, i) => ({
          label: i === 0 ? label : undefined,
          title: esc(s.heading),
          text: s.body ? esc(s.body) : undefined,
          glyph: i > 0 && i < slides.length - 1 && i % 2 === 1 ? glyph : undefined,
          url: i === slides.length - 1 ? `astrostudy.co.uk${lang === "fr" ? "/fr" : ""}/test` : undefined,
        })),
      };
    }
    case "pin":
      return { template: glyph ? "glyph" : "cover", size: "pin", lang, label, title: esc(post.title ?? card.hook), text: esc(firstSentence(post.description)), subtitle: esc(firstSentence(post.description)), glyph };
    case "story":
      return { template: "cover", size: "story", lang, label, title: esc(post.lines?.[0] ?? card.hook), subtitle: post.lines?.[1] ? esc(post.lines[1]) : undefined };
    case "still":
    case "text":
      return { template: "cover", size: "square", lang, label, title: esc(card.hook), wheel: false };
    default:
      return null;
  }
}
