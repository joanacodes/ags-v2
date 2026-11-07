/**
 * The Files screen's downloads, made in the browser from the file GitHub serves: nothing is sent anywhere.
 *
 * - PNG and JPG through a canvas, at the picture's own size (a drawing at the size asked for).
 * - PDF with pdfmake (AGS's own, loaded only when asked): one page the picture's shape, printed at 300 dpi;
 *   a drawing stays vector when pdfmake can draw it, else it goes in as a picture and the result says so.
 * - SVG only for a drawing, as the drawing itself: a picture is never wrapped in an SVG.
 * - Any format as the original file.
 *
 * A see-through picture or drawing can be put on a ground. A JPG can't be see-through: with no ground
 * chosen, a light ink gets black and a dark ink white. A PDF in light ink gets black too (its page reads
 * as white); in dark ink it stays see-through.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { FileKind } from "@/studio/files/baskets";

export type Ground = "none" | "white" | "black" | "paper";
export const GROUND_COLOURS: Readonly<Record<Exclude<Ground, "none">, string>> = { white: "#ffffff", black: "#000000", paper: "#f3f1ea" };
export type ExportFormat = "png" | "jpg" | "pdf" | "svg" | "original";

export interface ExportSource {
  readonly url: string;
  readonly ext: string;
  readonly kind: FileKind;
}

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly ground: Ground;
  /** The longest side, in pixels, a drawing is drawn at. Pictures keep their own size. */
  readonly drawingSize: number;
  /** The PDF's title. */
  readonly title: string;
}

export interface Exported {
  readonly blob: Blob;
  /** What the screen should say about the result, if anything. */
  readonly note: string | null;
}

const PRINT_DPI = 300;
const points = (px: number) => Math.round(((px * 72) / PRINT_DPI) * 100) / 100;

async function fetchFile(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for this file`);
  return res.blob();
}

interface Drawable {
  readonly width: number;
  readonly height: number;
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  close(): void;
}

async function pictureDrawable(blob: Blob): Promise<Drawable> {
  const bitmap = await createImageBitmap(blob);
  return { width: bitmap.width, height: bitmap.height, draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h), close: () => bitmap.close() };
}

/** A drawing's own proportions: its viewBox, else its width and height, else a square. */
export function svgProportions(text: string): { readonly width: number; readonly height: number } {
  const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
  const w = parseFloat(root.getAttribute("width") ?? "");
  const h = parseFloat(root.getAttribute("height") ?? "");
  return w > 0 && h > 0 ? { width: w, height: h } : { width: 1, height: 1 };
}

async function drawingDrawable(text: string, longest: number): Promise<Drawable> {
  const { width, height } = svgProportions(text);
  const scale = longest / Math.max(width, height);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("this drawing can't be opened by the browser");
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    close: () => URL.revokeObjectURL(url),
  };
}

function canvas(width: number, height: number): { readonly el: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D } {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("this browser can't draw pictures");
  return { el, ctx };
}

/** Whether the ground shows through, and whether the ink is light (a light ink on no ground needs a dark one). */
function look(d: Drawable): { readonly seeThrough: boolean; readonly lightInk: boolean } {
  const { ctx } = canvas(64, 64);
  d.draw(ctx, 64, 64);
  const px = ctx.getImageData(0, 0, 64, 64).data;
  let seeThrough = false;
  let ink = 0;
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    const alpha = px[i + 3]!;
    if (alpha < 250) seeThrough = true;
    if (alpha > 128) {
      ink += (0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255;
      count += 1;
    }
  }
  return { seeThrough, lightInk: count > 0 && ink / count > 0.6 };
}

/**
 * The colour under the picture, or null to keep it see-through. With no ground chosen, a JPG gets one (it
 * can't be see-through), and so does a PDF in light ink: its page reads as white, and white ink wouldn't show.
 */
function groundColour(format: ExportFormat, ground: Ground, seen: ReturnType<typeof look>): string | null {
  if (ground !== "none") return GROUND_COLOURS[ground];
  if (format === "jpg") return seen.seeThrough && seen.lightInk ? GROUND_COLOURS.black : GROUND_COLOURS.white;
  if (format === "pdf" && seen.seeThrough && seen.lightInk) return GROUND_COLOURS.black;
  return null;
}

function drawn(d: Drawable, type: "image/png" | "image/jpeg", fill: string | null): Promise<Blob> {
  const { el, ctx } = canvas(d.width, d.height);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, d.width, d.height);
  }
  d.draw(ctx, d.width, d.height);
  return new Promise((resolve, reject) => el.toBlob((b) => (b ? resolve(b) : reject(new Error("the browser couldn't make the file"))), type, type === "image/jpeg" ? 0.92 : undefined));
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("the file couldn't be read"));
    reader.readAsDataURL(blob);
  });
}

async function pdf(content: { readonly svg: string } | { readonly image: string }, width: number, height: number, fill: string | null, title: string): Promise<Blob> {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const vfs = (await import("pdfmake/build/vfs_fonts")).default;
  pdfMake.addVirtualFileSystem(vfs);
  const placed = { width, height, absolutePosition: { x: 0, y: 0 } };
  const definition: TDocumentDefinitions = {
    pageSize: { width, height },
    pageMargins: 0,
    info: { title, creator: "The Studio" },
    background: fill ? () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: fill }] }) : undefined,
    content: ["svg" in content ? { svg: content.svg, ...placed } : { image: content.image, ...placed }],
  };
  return pdfMake.createPdf(definition).getBlob();
}

/** The file in the format asked for. */
export async function exportFile(source: ExportSource, options: ExportOptions): Promise<Exported> {
  const { format } = options;
  const isDrawing = source.ext === "svg";
  if (format === "original" || (format === "svg" && isDrawing)) return { blob: await fetchFile(source.url), note: null };
  if (format === "svg") throw new Error("only a drawing has an SVG: this is a picture");
  if (source.kind !== "picture" && source.kind !== "drawing") throw new Error("only pictures and drawings change format");

  const file = await fetchFile(source.url);
  const text = isDrawing ? await file.text() : null;
  const d = text !== null ? await drawingDrawable(text, options.drawingSize) : await pictureDrawable(file);
  try {
    const seen = look(d);
    const fill = groundColour(format, options.ground, seen);
    if (format === "png") return { blob: await drawn(d, "image/png", fill), note: null };
    if (format === "jpg") {
      const note = options.ground === "none" && seen.seeThrough ? `A JPG can't be see-through: it's on ${fill === GROUND_COLOURS.black ? "black" : "white"}.` : null;
      return { blob: await drawn(d, "image/jpeg", fill), note };
    }
    const width = points(d.width);
    const height = points(d.height);
    const onBlack = options.ground === "none" && fill !== null ? "White ink wouldn't show on a PDF's white page: it's on black." : null;
    let note: string | null = onBlack;
    if (text !== null) {
      try {
        return { blob: await pdf({ svg: text }, width, height, fill, options.title), note };
      } catch (err) {
        console.warn("[studio] the drawing didn't go into the PDF as vector", err);
        note = [onBlack, "This drawing went into the PDF as a picture: the PDF maker couldn't draw it as vector."].filter(Boolean).join(" ");
      }
    }
    const jpegAsIs = (source.ext === "jpg" || source.ext === "jpeg") && fill === null;
    const image = await dataUrl(jpegAsIs ? file : await drawn(d, "image/png", fill));
    return { blob: await pdf({ image }, width, height, fill, options.title), note };
  } finally {
    d.close();
  }
}

/** The name a download is saved under: the basket first, so the two never mix in a downloads folder. */
export function downloadName(basket: string, folder: string, file: string, format: ExportFormat): string {
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = format === "original" ? (dot > 0 ? file.slice(dot + 1) : "") : format;
  const last = folder.split("/").filter(Boolean).pop();
  const parts = [basket, last && !stem.startsWith(last) ? last : null, stem].filter(Boolean).join("-");
  return ext ? `${parts}.${ext}` : parts;
}
