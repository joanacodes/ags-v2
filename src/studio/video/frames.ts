/**
 * Chromium photographs the template's states: one transparent PNG per state at 1080×1920, the glass
 * panels' mask for the composer's blur, and any text the template had to shrink past its floor. The
 * same browser photographs the pictures.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import type { VideoSpec } from "./spec";
import type { Timeline } from "./timeline";
import { templateById } from "../templates/registry";
import type { Picture } from "../pictures/templates";

export interface GlassRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
}

export interface FrameState {
  readonly start: number;
  readonly end: number;
  readonly file: string;
}

export interface Frames {
  readonly states: FrameState[];
  readonly glass: GlassRect[];
  readonly mask: string | null;
  readonly warnings: string[];
}

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const executablePath = process.env.STUDIO_CHROMIUM_PATH || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
}

export async function renderFrames(browser: Browser, spec: VideoSpec, timeline: Timeline, templatesDir: string, workDir: string): Promise<Frames> {
  const info = templateById(spec.template);
  if (!info || info.kind !== "video") throw new Error(`no video template "${spec.template}"`);
  await mkdir(workDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: info.width, height: info.height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.addInitScript((data) => {
      (window as unknown as { __spec: unknown; __timeline: unknown }).__spec = data.spec;
      (window as unknown as { __spec: unknown; __timeline: unknown }).__timeline = data.timeline;
    }, { spec, timeline });
    await page.goto(pathToFileURL(path.join(templatesDir, info.file)).href, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });
    const states = (await page.evaluate("window.studioTemplate.states().map(s => ({ start: s.start, end: s.end }))")) as { start: number; end: number }[];
    const out: FrameState[] = [];
    for (let i = 0; i < states.length; i += 1) {
      await page.evaluate(`window.studioTemplate.show(${i})`);
      const file = path.join(workDir, `state-${String(i).padStart(3, "0")}.png`);
      await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: info.width, height: info.height } });
      out.push({ start: states[i]!.start, end: states[i]!.end, file });
    }
    const glass = (await page.evaluate("window.studioTemplate.glass()")) as GlassRect[];
    const warnings = (await page.evaluate("window.studioTemplate.warnings()")) as string[];
    let mask: string | null = null;
    if (glass.length) {
      await page.setContent(
        `<html><body style="margin:0;width:${info.width}px;height:${info.height}px;background:#000;position:relative">${glass
          .map((g) => `<div style="position:absolute;left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;border-radius:${g.r}px;background:#fff"></div>`)
          .join("")}</body></html>`,
      );
      mask = path.join(workDir, "glass-mask.png");
      await page.screenshot({ path: mask, clip: { x: 0, y: 0, width: info.width, height: info.height } });
    }
    return { states: out, glass, mask, warnings };
  } finally {
    await context.close();
  }
}

/** Photograph prepared pictures; returns the files in order and the pages' warnings. */
export async function renderPictures(browser: Browser, list: readonly Picture[], workDir: string, name: string): Promise<{ files: { file: string; width: number; height: number; bytes: number }[]; warnings: string[] }> {
  await mkdir(workDir, { recursive: true });
  const files: { file: string; width: number; height: number; bytes: number }[] = [];
  const warnings: string[] = [];
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    for (const p of list) {
      const html = path.join(workDir, `${name}${p.suffix}.html`);
      await writeFile(html, p.html);
      await page.setViewportSize({ width: p.width, height: p.height });
      await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
      await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });
      warnings.push(...((await page.evaluate("window.__warnings || []")) as string[]));
      // JPEG, not PNG: Instagram's API takes JPEG only, and Bluesky refuses pictures over 1 MB.
      const file = path.join(workDir, `${name}${p.suffix}.jpg`);
      const bytes = await page.screenshot({ path: file, type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: p.width, height: p.height } });
      files.push({ file, width: p.width, height: p.height, bytes: bytes.byteLength });
    }
  } finally {
    await context.close();
  }
  return { files, warnings };
}
