/**
 * The templates the Studio renders with, and what each one takes. The files themselves are static
 * pages in public/studio/templates/ (one file, previewed in the browser and rendered by Chromium); this
 * is what the gate, the Video studio and the specs read about them.
 */
import type { Format } from "../types";

export interface TemplateInfo {
  readonly id: string;
  readonly kind: "video" | "picture";
  readonly label: string;
  readonly file: string;
  readonly formats: readonly Format[];
  readonly width: number;
  readonly height: number;
  /** Words per on-screen line, and lines, the template can hold before the text shrinks. */
  readonly lineWords: number;
  readonly maxLines: number;
  readonly needs: readonly ("statements" | "figure" | "sky" | "anchor" | "steps")[];
  readonly blurb: string;
}

export const VIDEO_TEMPLATES: readonly TemplateInfo[] = [
  { id: "meadow-text", kind: "video", label: "Meadow and text", file: "meadow-text.html", formats: ["video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: [], blurb: "The default: the hook in Fraunces, each line on glass, the captions on a cream bar." },
  { id: "test-three-cards", kind: "video", label: "The test: three cards", file: "test-three-cards.html", formats: ["video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: ["statements"], blurb: "Three descriptions A, B, C revealed in turn: which one is you?" },
  { id: "placement-callout", kind: "video", label: "Placement call-out", file: "placement-callout.html", formats: ["video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: ["anchor"], blurb: "The placement's symbol on the sky, then the dynamic in plain words." },
  { id: "figure-card", kind: "video", label: "Figure card", file: "figure-card.html", formats: ["video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: ["figure"], blurb: "One verified figure with its source, then the lines." },
  { id: "sky-this-week", kind: "video", label: "The sky this week", file: "sky-this-week.html", formats: ["video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: ["sky"], blurb: "A date, an event, how to find the house it lands in." },
  { id: "screen-recording", kind: "video", label: "Screen recording", file: "screen-overlay.html", formats: ["video", "long_video"], width: 1080, height: 1920, lineWords: 6, maxLines: 8, needs: ["steps"], blurb: "A real page driven by steps (the test, AGS), with the voice and captions." },
];

export const PICTURE_TEMPLATES: readonly TemplateInfo[] = [
  { id: "carousel", kind: "picture", label: "Carousel", file: "picture.html", formats: ["carousel"], width: 1080, height: 1350, lineWords: 20, maxLines: 7, needs: [], blurb: "5–7 slides: a cover, the points on the sky, the name and the address." },
  { id: "pin", kind: "picture", label: "Pin", file: "picture.html", formats: ["pin"], width: 1000, height: 1500, lineWords: 14, maxLines: 3, needs: [], blurb: "2:3 for Pinterest: the keyword as the headline on glass." },
  { id: "still", kind: "picture", label: "Still (quote card)", file: "picture.html", formats: ["still", "text"], width: 1080, height: 1080, lineWords: 25, maxLines: 4, needs: [], blurb: "The hook on glass, for text posts on Facebook, X, Bluesky and Mastodon." },
  { id: "story", kind: "picture", label: "Story", file: "picture.html", formats: ["story"], width: 1080, height: 1920, lineWords: 12, maxLines: 3, needs: [], blurb: "One line and the reply keyword, 9:16." },
];

export const ALL_TEMPLATES: readonly TemplateInfo[] = [...VIDEO_TEMPLATES, ...PICTURE_TEMPLATES];

export function templateById(id: string): TemplateInfo | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}
