/**
 * A design as an email: HTML every email program shows alike (tables, inline styles, a 600 px card,
 * buttons that are plain links) and the plain-text version sent beside it. Pure and deterministic: the
 * same design, settings and options give the same bytes.
 *
 * Everything the owner typed is escaped. A link that isn't https, http or mailto, and a picture that
 * isn't https, is left out of a real email rather than sent; a preview shows where it is missing. The
 * footer is never optional: who sends, their postal address, why the reader gets this, and the
 * unsubscribe link.
 */
import type { Language } from "../types";
import { BRAND_LABELS, FONT_STACKS, type Block, type Brand, type BrandSettings, type DesignContent } from "./model";

export interface RenderOptions {
  /** The reader's own unsubscribe address. */
  readonly unsubscribeUrl: string;
  /** For {{first_name}}; empty uses the tag's fallback. */
  readonly firstName?: string | null;
  /** A preview: empty pictures and buttons without a link show as placeholders instead of being left out. */
  readonly preview?: boolean;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly preheader: string;
  readonly html: string;
  readonly text: string;
}

const CARD = 600;
const SIDE = 40;
const CONTENT = CARD - 2 * SIDE;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A link an email may carry: https, http or mailto, and nothing else (no javascript:, no data:). */
export function safeLink(raw: string): string | null {
  const u = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (!u || /[\s<>"'`]/.test(u) || /[\u0000-\u001f\u007f]/.test(u)) return null;
  if (/^mailto:[^@\s/]+@[^@\s/]+\.[a-z]{2,}(\?[^\s]*)?$/i.test(u)) return u;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A picture's address: https only, since email programs block the rest. */
export function safeImage(raw: string): string | null {
  const u = safeLink(raw);
  return u !== null && u.startsWith("https://") ? u : null;
}

/**
 * {{first_name}} and {{first_name|fallback}}: the reader's first name, else the fallback, else nothing (and
 * the space before the tag goes with it, so "Hello {{first_name}}," reads "Hello,").
 */
export function mergeName(text: string, firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  return text.replace(/(\s*)\{\{\s*first_name\s*(?:\|([^}]*))?\}\}/g, (_m, space: string, fallback: string | undefined) => {
    const value = name || (fallback ?? "").trim();
    return value ? `${space}${value}` : "";
  });
}

// The address may hold one level of brackets (…/wiki/Aries_(constellation)).
const LINK = /\[([^\]\n]{1,200})\]\(((?:[^()\s]|\([^()\s]*\)){1,2000})\)/g;

function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/** **bold**, *italic* and [a link](https://…) in one line the owner typed, escaped. */
export function inlineHtml(raw: string, linkStyle: string): string {
  const out: string[] = [];
  let last = 0;
  for (const m of raw.matchAll(LINK)) {
    const at = m.index ?? 0;
    out.push(emphasis(escapeHtml(raw.slice(last, at))));
    const href = safeLink(m[2] ?? "");
    const label = emphasis(escapeHtml(m[1] ?? ""));
    out.push(href ? `<a href="${escapeHtml(href)}" style="${linkStyle}">${label}</a>` : label);
    last = at + m[0].length;
  }
  out.push(emphasis(escapeHtml(raw.slice(last))));
  return out.join("");
}

/** The same line as plain text: a link becomes "label (address)". */
export function inlineText(raw: string): string {
  return raw
    .replace(LINK, (_m, label: string, url: string) => {
      const href = safeLink(url);
      return href ? `${label} (${href})` : label;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** a → b by t (0 to 1), for the hairlines: a colour that exists in every email program, unlike opacity. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

const UNSUBSCRIBE: Readonly<Record<Language, string>> = { en: "Unsubscribe", fr: "Se désinscrire" };
const PICTURE_MISSING: Readonly<Record<Language, string>> = { en: "Choose a picture", fr: "Choisir une image" };

interface Look {
  readonly s: BrandSettings;
  readonly head: string;
  readonly body: string;
  readonly line: string;
  readonly link: string;
  readonly preview: boolean;
  readonly language: Language;
  readonly name: (t: string) => string;
}

const row = (inner: string, padding = `8px ${SIDE}px`, extra = "") => `<tr><td class="px" style="padding:${padding}"${extra}>${inner}</td></tr>`;

function placeholder(look: Look, label: string, height: number): string {
  const c = look.s.colors;
  return `<div style="height:${height}px;line-height:${height}px;border:1px dashed ${c.muted};color:${c.muted};font-family:${look.body};font-size:13px;text-align:center">${escapeHtml(label)}</div>`;
}

function textParagraphs(look: Look, text: string, align: string, size = 16): string {
  const c = look.s.colors;
  return paragraphs(look.name(text))
    .map((p, i, all) => {
      const lines = p.split("\n").map((l) => inlineHtml(l, look.link)).join("<br>");
      return `<p style="margin:0 0 ${i === all.length - 1 ? 0 : 14}px;font-family:${look.body};font-size:${size}px;line-height:1.6;color:${c.text};text-align:${align}">${lines}</p>`;
    })
    .join("");
}

function imageTag(look: Look, src: string, alt: string, width: number, center: boolean): string {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none${center ? ";margin:0 auto" : ""}">`;
}

function blockHtml(b: Block, look: Look): string | null {
  const c = look.s.colors;
  switch (b.type) {
    case "heading": {
      const tag = b.level === 1 ? "h1" : "h2";
      const size = b.level === 1 ? 28 : 22;
      return row(`<${tag} style="margin:0;font-family:${look.head};font-size:${size}px;line-height:1.25;font-weight:600;color:${c.text};text-align:${b.align}">${inlineHtml(look.name(b.text), look.link)}</${tag}>`);
    }
    case "text":
      return b.text.trim() ? row(textParagraphs(look, b.text, b.align)) : null;
    case "image": {
      const src = safeImage(b.src);
      const width = Math.round((CONTENT * b.width) / 100);
      if (!src) return look.preview ? row(placeholder(look, PICTURE_MISSING[look.language], 160)) : null;
      const img = imageTag(look, src, b.alt, width, b.align === "center");
      const href = safeLink(b.href);
      const inner = href ? `<a href="${escapeHtml(href)}" style="text-decoration:none">${img}</a>` : img;
      return row(inner, `8px ${SIDE}px`, ` align="${b.align}"`);
    }
    case "button": {
      const href = safeLink(b.href) ?? (look.preview ? "#" : null);
      if (!href || !b.label.trim()) return null;
      const solid = b.style === "solid";
      const cell = solid ? `background:${c.accent};` : `border:2px solid ${c.accent};`;
      const align = b.align === "left" ? "" : ` align="${b.align}"`;
      const link = `<a href="${escapeHtml(href)}" style="display:inline-block;padding:${solid ? "14px 28px" : "12px 26px"};font-family:${look.body};font-size:16px;font-weight:600;line-height:1.2;color:${solid ? c.button_text : c.accent};text-decoration:none;border-radius:999px">${escapeHtml(b.label)}</a>`;
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align}><tr><td style="border-radius:999px;${cell}">${link}</td></tr></table>`, `14px ${SIDE}px`, ` align="${b.align}"`);
    }
    case "split": {
      const width = Math.round(CONTENT * 0.45);
      const src = safeImage(b.src);
      const img = src ? imageTag(look, src, b.alt, width, false) : look.preview ? placeholder(look, PICTURE_MISSING[look.language], 140) : "";
      const text = textParagraphs(look, b.text, "left", 15);
      if (!img) return b.text.trim() ? row(text) : null;
      const imgCell = `<td width="${width}" valign="top" style="width:${width}px;padding-${b.side === "left" ? "right" : "left"}:16px">${img}</td>`;
      const textCell = `<td valign="top">${text}</td>`;
      return row(`<table role="presentation" class="split" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${b.side === "left" ? imgCell + textCell : textCell + imgCell}</tr></table>`);
    }
    case "quote": {
      if (!b.text.trim()) return null;
      const cite = b.cite.trim() ? `<p style="margin:8px 0 0;font-family:${look.body};font-size:13px;line-height:1.4;color:${c.muted}">— ${escapeHtml(b.cite.trim())}</p>` : "";
      return row(`<div style="border-left:3px solid ${c.accent};padding:4px 0 4px 16px"><p style="margin:0;font-family:${look.head};font-size:20px;line-height:1.45;font-style:italic;color:${c.text}">${inlineHtml(look.name(b.text), look.link)}</p>${cite}</div>`);
    }
    case "divider":
      return row(`<div style="height:1px;line-height:1px;font-size:1px;background:${look.line}">&nbsp;</div>`, `16px ${SIDE}px`);
    case "spacer":
      return `<tr><td style="height:${b.size}px;line-height:${b.size}px;font-size:1px">&nbsp;</td></tr>`;
  }
}

function blockText(b: Block, name: (t: string) => string): string | null {
  switch (b.type) {
    case "heading":
      return inlineText(name(b.text)).trim() || null;
    case "text":
    case "split":
      return paragraphs(name(b.text)).map(inlineText).join("\n\n") || null;
    case "image": {
      const href = safeLink(b.href);
      return href && safeImage(b.src) ? `${b.alt.trim() || "Picture"}: ${href}` : null;
    }
    case "button": {
      const href = safeLink(b.href);
      return href && b.label.trim() ? `${b.label.trim()}: ${href}` : null;
    }
    case "quote":
      return b.text.trim() ? `“${inlineText(name(b.text)).trim()}”${b.cite.trim() ? ` — ${b.cite.trim()}` : ""}` : null;
    case "divider":
      return "———";
    case "spacer":
      return null;
  }
}

export function renderEmail(design: DesignContent, brand: Brand, s: BrandSettings, opts: RenderOptions): RenderedEmail {
  const c = s.colors;
  const language = design.language;
  const name = (t: string) => mergeName(t, opts.firstName);
  const look: Look = {
    s,
    head: FONT_STACKS[s.fonts.heading].stack,
    body: FONT_STACKS[s.fonts.body].stack,
    line: mix(c.muted, c.card, 0.7),
    link: `color:${c.accent};text-decoration:underline`,
    preview: opts.preview === true,
    language,
    name,
  };
  const sender = s.sender_name.trim() || BRAND_LABELS[brand];
  const subject = name(design.subject).trim();
  const preheader = name(design.preheader).trim();
  const unsubscribe = safeLink(opts.unsubscribeUrl) ?? "#";
  const logo = safeImage(s.logo_url);
  const masthead = logo
    ? row(`<img src="${escapeHtml(logo)}" alt="${escapeHtml(sender)}" height="40" style="display:block;height:40px;width:auto;border:0">`, `32px ${SIDE}px 12px`)
    : row(`<p style="margin:0;font-family:${look.head};font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${c.muted}">${escapeHtml(sender)}</p>`, `32px ${SIDE}px 12px`);
  const blocks = design.blocks.map((b) => blockHtml(b, look)).filter((h): h is string => h !== null);
  const address = s.footer_address.trim();
  const note = s.footer_note[language].trim();
  const footer = [
    `<p style="margin:0 0 6px">${escapeHtml(sender)}${address ? ` · ${escapeHtml(address)}` : ""}</p>`,
    note ? `<p style="margin:0 0 6px">${escapeHtml(note)}</p>` : "",
    `<p style="margin:0"><a href="${escapeHtml(unsubscribe)}" style="color:${c.muted};text-decoration:underline">${UNSUBSCRIBE[language]}</a></p>`,
  ].join("");
  const spacerChars = "&#847;&zwnj;&nbsp;".repeat(40);

  const html = [
    "<!doctype html>",
    `<html lang="${language}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(subject)}</title>`,
    `<style>@media only screen and (max-width:620px){.card{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.split td{display:block!important;width:100%!important;padding:0 0 12px!important}}</style>`,
    "</head>",
    `<body style="margin:0;padding:0;background:${c.page}">`,
    preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}${spacerChars}</div>` : "",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page}"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" class="card" width="${CARD}" cellpadding="0" cellspacing="0" border="0" style="width:${CARD}px;max-width:${CARD}px;background:${c.card};border-radius:12px">`,
    masthead,
    ...blocks,
    `<tr><td style="height:28px;line-height:28px;font-size:1px">&nbsp;</td></tr>`,
    "</table>",
    `<table role="presentation" class="card" width="${CARD}" cellpadding="0" cellspacing="0" border="0" style="width:${CARD}px;max-width:${CARD}px">`,
    `<tr><td class="px" style="padding:20px ${SIDE}px;font-family:${look.body};font-size:12px;line-height:1.6;color:${c.muted};text-align:center">${footer}</td></tr>`,
    "</table>",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ].join("\n");

  const textParts = design.blocks.map((b) => blockText(b, name)).filter((t): t is string => t !== null);
  const text = [
    ...textParts,
    "",
    "—",
    `${sender}${address ? ` · ${address}` : ""}`,
    note,
    `${UNSUBSCRIBE[language]}: ${unsubscribe}`,
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject, preheader, html, text };
}
