/**
 * The picture templates, ported from the site's image generator (tools/brand-images/render.mjs): cover,
 * glyph, quote, stat, challenge and carousel, at the platforms' sizes. Each returns the HTML of one
 * picture; the worker photographs it with Chromium, and the Video studio frames the same HTML for its
 * preview. Asset addresses are given by the caller (file:// on the runner, /studio/… in the browser).
 */
import { BASE_CSS, CHALLENGE_CSS, COVER_CSS, END_CSS, GLYPH_CSS, PAGE_JS, QUOTE_CSS, STAT_CSS } from "./css";

export const SIZES = {
  og: [1200, 630],
  square: [1080, 1080],
  post: [1080, 1350],
  story: [1080, 1920],
  pin: [1000, 1500],
} as const;
export type PictureSize = keyof typeof SIZES;

export interface Assets {
  /** Base address of the fonts folder, ending with "/". */
  readonly fonts: string;
  /** Base address of the media folder, ending with "/". */
  readonly media: string;
}

export interface Slide {
  readonly label?: string;
  readonly title: string;
  readonly text?: string;
  readonly glyph?: string;
  readonly url?: string;
}

export interface PictureJob {
  readonly template: "cover" | "glyph" | "quote" | "stat" | "challenge" | "carousel";
  readonly size?: PictureSize;
  readonly lang?: string;
  readonly label?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly text?: string;
  readonly glyph?: string;
  readonly url?: string;
  readonly swipe?: boolean | string;
  readonly wheel?: boolean;
  readonly quote?: string;
  readonly author?: string;
  readonly context?: string;
  readonly stars?: number;
  readonly number?: string;
  readonly note?: string;
  readonly numberStyle?: "sun" | "red" | "plain";
  readonly count?: number;
  readonly choices?: readonly { letter?: string; text?: string }[];
  readonly chance?: string;
  readonly variant?: "result";
  readonly picked?: string;
  readonly result?: string;
  readonly slides?: readonly Slide[];
  readonly background?: string;
  readonly backgroundPosition?: string;
}

export interface Picture {
  readonly suffix: string;
  readonly width: number;
  readonly height: number;
  readonly html: string;
}

const SITE_URL = "astrostudy.co.uk";
const DEFAULT_SIZE: Record<string, PictureSize> = { cover: "post", glyph: "og", quote: "post", stat: "post", challenge: "post", carousel: "post" };

const WORDS = {
  en: {
    swipe: "Swipe",
    stars: (n: number) => `${n} out of 5 stars`,
    statLabel: "In my tests",
    challengeLabel: "The Astro Study test",
    challengeTitle: "Which one <em>is you?</em>",
    challengeSub: (n: number) => `${["Two", "Three", "Four", "Five", "Six"][n - 2]} descriptions. Only one was written from your chart.`,
    challengeChance: (n: number) => `Chance: 1 in ${n}`,
    resultTitle: "I picked <em>my chart</em>",
  },
  fr: {
    swipe: "Faites glisser",
    stars: (n: number) => `${n} étoiles sur 5`,
    statLabel: "Dans mes tests",
    challengeLabel: "Le test de The Astro Study",
    challengeTitle: "Laquelle <em>est la vôtre ?</em>",
    challengeSub: (n: number) => `${["Deux", "Trois", "Quatre", "Cinq", "Six"][n - 2]} descriptions. Une seule a été écrite à partir de votre thème.`,
    challengeChance: (n: number) => `Au hasard : 1 sur ${n}`,
    resultTitle: "J’ai trouvé <em>mon thème</em>",
  },
};
const words = (lang?: string) => (lang?.startsWith("fr") ? WORDS.fr : WORDS.en);

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SYMBOL = /([☀-⛿✀-➿■-◿])(?!︎)/g;
const plainSymbols = (html: string) => String(html ?? "").replace(SYMBOL, "$1︎");

function glyphHTML(str?: string) {
  return Array.from(String(str || "✦"))
    .map((ch) => (ch === "/" ? '<span class="slash">/</span>' : ch === " " ? " " : `${ch}︎`))
    .join("");
}

function fontCSS(fonts: string) {
  const face = (family: string, file: string, style: string, weight: string, range?: string) =>
    `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:url("${fonts}${file}") format("woff2");${range ? `unicode-range:${range};` : ""}}`;
  const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  const EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF";
  const SYMBOLS = "U+25A1,U+25B3,U+2605,U+2609,U+260C-260D,U+263D,U+263F-2640,U+2642-2653,U+26B7-26B8,U+2726";
  return [
    face("Fraunces", "fraunces-normal-latin.woff2", "normal", "300 600", LATIN),
    face("Fraunces", "fraunces-normal-latin-ext.woff2", "normal", "300 600", EXT),
    face("Fraunces", "fraunces-italic-latin.woff2", "italic", "300 600", LATIN),
    face("Fraunces", "fraunces-italic-latin-ext.woff2", "italic", "300 600", EXT),
    face("Inter", "inter-normal-latin.woff2", "normal", "300 600", LATIN),
    face("Inter", "inter-normal-latin-ext.woff2", "normal", "300 600", EXT),
    face("Astro Symbols", "noto-sans-symbols-astro.woff2", "normal", "400", SYMBOLS),
  ].join("\n");
}

function wheelSVG() {
  const signs = "♈♉♊♋♌♍♎♏♐♑♒♓";
  const r = (d: number) => (d * Math.PI) / 180;
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const a = r(i * 30);
    ticks += `M${(-80 * Math.cos(a)).toFixed(1)} ${(80 * Math.sin(a)).toFixed(1)}L${(-100 * Math.cos(a)).toFixed(1)} ${(100 * Math.sin(a)).toFixed(1)}`;
  }
  const glyphs = Array.from(signs)
    .map((g, i) => {
      const a = r(i * 30 + 15);
      return `<text x="${(-90 * Math.cos(a)).toFixed(1)}" y="${(90 * Math.sin(a)).toFixed(1)}">${g}︎</text>`;
    })
    .join("");
  return `<svg viewBox="-110 -110 220 220" aria-hidden="true"><circle class="w-line" r="100"/><circle class="w-line" r="80"/><circle class="w-line w-faint" r="56"/><path class="w-line w-faint" d="${ticks}"/>${glyphs}</svg>`;
}

const wordmark = (extra = "") => `<div class="wm ${extra}"><span class="wm__dot"></span><span>The Astro <em>Study</em></span></div>`;

interface Dims {
  w: number;
  h: number;
  u: number;
  orient: "land" | "square" | "port";
  size: PictureSize;
}

function dims(size: PictureSize): Dims {
  const [w, h] = SIZES[size];
  const orient = size === "og" ? "land" : size === "square" ? "square" : "port";
  const u = size === "og" ? 1 : w / 1080;
  return { w, h, u, orient, size };
}

function background(job: PictureJob, d: Dims, assets: Assets) {
  const file = job.background ?? (d.orient === "land" ? "meadow-poster-wide.jpg" : "meadow-poster-tall.jpg");
  const pos = job.backgroundPosition || (d.orient === "land" ? "50% 42%" : d.size === "story" ? "50% 50%" : "50% 34%");
  return { url: `${assets.media}${file}`, pos, zoom: 1 };
}

function pageHTML(o: { d: Dims; lang?: string; bg: { url: string; pos: string; zoom: number }; cls: string; body: string; css: string; fonts: string }) {
  return `<!doctype html><html lang="${esc(o.lang || "en")}"><head><meta charset="utf-8">
<style>${fontCSS(o.fonts)}${BASE_CSS}${o.css}</style>
<style>:root{--W:${o.d.w}px;--H:${o.d.h}px;--u:${o.d.u}px;--bg:url("${o.bg.url}")}</style>
</head><body class="is-${o.d.orient} size-${o.d.size} ${o.cls}"><div class="bg"></div>${plainSymbols(o.body)}
<script>${PAGE_JS.replace("__BG__", JSON.stringify(o.bg.url)).replace("__POS__", JSON.stringify(o.bg.pos)).replace("__ZOOM__", String(o.bg.zoom))}</script>
</body></html>`;
}

const fit = (min: number) => `data-fit="${min}"`;

interface Made {
  cls: string;
  css: string;
  body: string;
}

function cover(job: PictureJob, d: Dims): Made {
  const w = words(job.lang);
  const label = job.label ? `<p class="label">${job.label}</p>` : "";
  const text = job.subtitle || job.text ? `<p class="text" ${fit(18 * d.u)}>${job.subtitle || job.text}</p>` : "";
  const right = job.swipe ? `<span class="url">${esc(job.swipe === true ? w.swipe : job.swipe)} →</span>` : `<span class="url">${esc(job.url || SITE_URL)}</span>`;
  return {
    cls: "cover",
    css: COVER_CSS,
    body: `${job.wheel === false ? "" : `<div class="wheel">${wheelSVG()}</div>`}
<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    ${label}
    <h1 class="title" ${fit(34 * d.u)}>${job.title || ""}</h1>
    ${text}
    <div class="foot">${wordmark()}${right}</div>
  </div>
</div></div>`,
  };
}

function glyph(job: PictureJob, d: Dims, extra: { counter?: string; right?: string } = {}): Made {
  const pair = /[/ ]/.test(String(job.glyph || "").trim());
  const big = `<div class="glyph-big${pair ? " is-pair" : ""}">${glyphHTML(job.glyph)}</div>`;
  const zone = d.orient === "land" ? `<div class="glass glass--sky sky"><div class="glass__bg"></div>${big}</div>` : `<div class="glyph-zone">${big}</div>`;
  const label = job.label ? `<p class="label">${job.label}</p>` : "";
  const text = job.text ? `<p class="text" ${fit(17 * d.u)}>${job.text}</p>` : "";
  const right = extra.right ?? `<span class="url">${esc(job.url || SITE_URL)}</span>`;
  return {
    cls: "glyph",
    css: GLYPH_CSS,
    body: `${zone}${extra.counter || ""}
<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    ${label}
    <h1 class="title" ${fit(30 * d.u)}>${job.title || ""}</h1>
    ${text}
    <div class="foot">${wordmark()}${right}</div>
  </div>
</div></div>`,
  };
}

function quote(job: PictureJob, d: Dims): Made {
  const n = Math.max(0, Math.min(5, Number(job.stars ?? 0)));
  const stars = n ? `<div class="stars" role="img" aria-label="${esc(words(job.lang).stars(n))}">${"★︎".repeat(n)}</div>` : "";
  const q = String(job.quote || "").trim();
  const quoted = /^[“"«]/.test(q) ? q : job.lang?.startsWith("fr") ? `« ${q} »` : `“${q}”`;
  return {
    cls: "quote",
    css: QUOTE_CSS,
    body: `<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    ${stars}
    <p class="q" ${fit(28 * d.u)}>${quoted}</p>
    <div class="who">${job.author ? `<strong>${job.author}</strong>` : ""}${job.context ? `<span ${fit(14 * d.u)}>${job.context}</span>` : ""}</div>
    <div class="foot">${wordmark()}<span class="url">${esc(job.url || SITE_URL)}</span></div>
  </div>
</div></div>`,
  };
}

function stat(job: PictureJob, d: Dims): Made {
  const w = words(job.lang);
  return {
    cls: "stat",
    css: STAT_CSS,
    body: `<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    <p class="label">${job.label || w.statLabel}</p>
    <div class="stat-num">
      <p class="n" ${fit(90 * d.u)}><span class="${job.numberStyle === "plain" ? "" : job.numberStyle === "red" ? "redword" : "sunword"}">${job.number || ""}</span></p>
      <div class="rule"></div>
    </div>
    <div class="stat-words">
      <p class="say" ${fit(24 * d.u)}>${job.text || ""}</p>
      ${job.note ? `<p class="note" ${fit(14 * d.u)}>${job.note}</p>` : ""}
    </div>
    <div class="foot">${wordmark()}<span class="url">${esc(job.url || SITE_URL)}</span></div>
  </div>
</div></div>`,
  };
}

function challenge(job: PictureJob, d: Dims): Made {
  const w = words(job.lang);
  const isResult = job.variant === "result";
  const letters = ["A", "B", "C", "D", "E", "F"];
  const picked = String(job.picked || "").toUpperCase();
  const n = job.choices ? Math.min(job.choices.length, 6) : Math.min(Math.max(Number(job.count) || 3, 2), 6);
  const choices = (job.choices || letters.slice(0, n).map((l) => ({ letter: l, text: undefined as string | undefined })))
    .slice(0, n)
    .map((c, i) => {
      const letter = c.letter || letters[i]!;
      const inner = c.text ? `<p>${c.text}</p>` : "<i></i><i></i><i></i><i></i>";
      return `<div class="choice${isResult && picked === letter ? " is-yours" : ""}"><b>${esc(letter)}</b>${inner}</div>`;
    })
    .join("");
  const mark = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#b5512c" stroke-width="2.4"/><path d="M30 52 L44 65 L71 36" fill="none" stroke="#b5512c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const body = isResult
    ? `${mark}
    <h1 class="title" ${fit(36 * d.u)}>${job.title || w.resultTitle}</h1>
    ${job.result ? `<p class="text" ${fit(16 * d.u)}>${job.result}</p>` : ""}
    <div class="choices${n > 3 ? " choices--many" : ""}">${choices}</div>`
    : `<h1 class="title" ${fit(36 * d.u)}>${job.title || w.challengeTitle}</h1>
    <p class="text" ${fit(16 * d.u)}>${job.subtitle || w.challengeSub(n)}</p>
    <div class="choices${n > 3 ? " choices--many" : ""}">${choices}</div>`;
  return {
    cls: "challenge",
    css: CHALLENGE_CSS,
    body: `<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    <p class="label">${job.label || w.challengeLabel}</p>
    ${body}
    <div class="foot">${wordmark()}<span class="chance">${job.chance || w.challengeChance(n)}</span></div>
  </div>
</div></div>`,
  };
}

function endSlide(slide: Slide, d: Dims, counter: string): Made {
  return {
    cls: "end",
    css: END_CSS,
    body: `<div class="wheel">${wheelSVG()}</div>${counter}
<div class="stage"><div class="glass card"><div class="glass__bg"></div>
  <div class="card__in" data-fit-box>
    ${wordmark()}
    ${slide.title ? `<p class="title" style="font-size:calc(var(--u)*56)" ${fit(26 * d.u)}>${slide.title}</p>` : ""}
    ${slide.text ? `<p class="text" ${fit(18 * d.u)}>${slide.text}</p>` : ""}
    <span class="url">${esc(slide.url || SITE_URL)}</span>
  </div>
</div></div>`,
  };
}

/** Every picture a job makes (a carousel makes one per slide), as HTML ready to photograph. */
export function pictures(job: PictureJob, assets: Assets): Picture[] {
  const make = (d: Dims, m: Made, suffix: string): Picture => ({
    suffix,
    width: d.w,
    height: d.h,
    html: pageHTML({ d, lang: job.lang, bg: background(job, d, assets), cls: m.cls, body: m.body, css: m.css, fonts: assets.fonts }),
  });
  if (job.template === "carousel") {
    const slides = job.slides ?? [];
    if (slides.length < 2) throw new Error("a carousel needs at least two slides");
    const d = dims("post");
    const n = slides.length;
    return slides.map((s, i) => {
      const counter = `<div class="counter">${i + 1}/${n}</div>`;
      let t: Made;
      if (i === 0) t = cover({ ...job, ...s, template: "cover", swipe: true, wheel: job.wheel }, d);
      else if (i === n - 1) t = endSlide(s, d, counter);
      else t = s.glyph ? glyph({ ...job, ...s, template: "glyph" }, d, { counter, right: "" }) : cover({ ...job, ...s, template: "cover", wheel: true }, d);
      if (i > 0 && i < n - 1 && !s.glyph) t = { ...t, body: counter + t.body };
      return make(d, t, `-${String(i + 1).padStart(2, "0")}`);
    });
  }
  const size = job.size ?? DEFAULT_SIZE[job.template] ?? "post";
  const d = dims(size);
  const fn = { cover, glyph, quote, stat, challenge }[job.template];
  return [make(d, fn(job, d), "")];
}
