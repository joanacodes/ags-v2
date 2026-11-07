/**
 * From the voice's timings to what is on screen when: words, caption segments (2–4 words, never
 * splitting a number or a name, none shorter than 0.6 s), the on-screen lines as scenes (the hook holds
 * the first three seconds whatever the timing, the disclosure the last second), and the SRT.
 */

export interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface Segment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface Scene {
  readonly index: number;
  readonly kind: "hook" | "line" | "disclosure";
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface Timeline {
  readonly duration: number;
  readonly voiceEnd: number;
  readonly words: Word[];
  readonly captions: Segment[];
  readonly scenes: Scene[];
}

export interface Alignment {
  readonly characters: readonly string[];
  readonly character_start_times_seconds: readonly number[];
  readonly character_end_times_seconds: readonly number[];
}

/** ElevenLabs' character alignment to words. */
export function wordsFromAlignment(a: Alignment): Word[] {
  const out: Word[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  for (let i = 0; i < a.characters.length; i += 1) {
    const ch = a.characters[i] ?? "";
    if (/\s/.test(ch)) {
      if (text) out.push({ text, start, end });
      text = "";
      continue;
    }
    if (!text) start = a.character_start_times_seconds[i] ?? end;
    text += ch;
    end = a.character_end_times_seconds[i] ?? end;
  }
  if (text) out.push({ text, start, end });
  return out;
}

/** Timings for a script with no voice yet: 150 words a minute, the Video studio's estimate. */
export function estimatedWords(script: string, wordsPerMinute = 150): Word[] {
  const per = 60 / wordsPerMinute;
  return script
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => ({ text, start: i * per, end: i * per + per * 0.92 }));
}

const GLUE_AFTER_NUMBER = /^(in|out|of|on|sur|times|fois|%|per|pour)$/i;
const isNumber = (w: string) => /\d/.test(w);
const endsSentence = (w: string) => /[.!?…:;,]$/.test(w);
const isCapital = (w: string) => /^\p{Lu}/u.test(w);

/** May the caption break between these two words? Not inside "7 in 10", not inside "The Astro Study". */
function mayBreak(prev: string, next: string, prevStartsSentence: boolean): boolean {
  if (isNumber(prev) && (GLUE_AFTER_NUMBER.test(next) || isNumber(next))) return false;
  if (GLUE_AFTER_NUMBER.test(prev) && isNumber(next)) return false;
  if (isCapital(prev) && isCapital(next) && !endsSentence(prev) && !prevStartsSentence) return false;
  return true;
}

export function captionSegments(words: readonly Word[], perSegment = 3, minSeconds = 0.6): Segment[] {
  const groups: Word[][] = [];
  let current: Word[] = [];
  words.forEach((w, i) => {
    current.push(w);
    const next = words[i + 1];
    if (!next) return;
    const startsSentence = i === 0 || endsSentence(words[i - 1]?.text ?? ".");
    const full = current.length >= perSegment;
    const hard = current.length >= perSegment + 3;
    const breakable = mayBreak(w.text, next.text, startsSentence && current.length === 1);
    if ((endsSentence(w.text) && current.length >= 2) || hard || (full && breakable)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  // A segment shorter than the minimum joins its neighbour (the next one, or the previous at the end).
  const merged: Word[][] = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    const dur = g[g.length - 1]!.end - g[0]!.start;
    if (prev && dur < minSeconds && prev.length + g.length <= perSegment + 3) prev.push(...g);
    else merged.push([...g]);
  }
  const out: Segment[] = merged.map((g) => ({ text: g.map((w) => w.text).join(" "), start: g[0]!.start, end: g[g.length - 1]!.end }));
  // Continuous: each caption stays until the next one starts.
  return out.map((s, i) => ({ ...s, end: Math.max(s.end, out[i + 1]?.start ?? s.end + 0.3) }));
}

const norm = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** The on-screen lines, each held from the moment the voice reaches its first word. */
export function scenesFor(lines: readonly string[], words: readonly Word[], voiceEnd: number, duration: number, disclosure: boolean): Scene[] {
  const starts: number[] = [];
  let cursor = 0;
  const total = words.length;
  const lineWords = lines.map((l) => l.split(/\s+/).filter(Boolean));
  const totalLineWords = lineWords.reduce((n, l) => n + l.length, 0) || 1;
  let proportional = 0;
  lineWords.forEach((lw) => {
    const first = norm(lw[0] ?? "");
    let found = -1;
    for (let j = cursor; j < Math.min(total, cursor + 12); j += 1) {
      if (norm(words[j]!.text) === first) {
        found = j;
        break;
      }
    }
    // Not found where expected (the line rewords the voice): place it by its share of the words.
    const estimate = Math.min(total - 1, Math.round((proportional / totalLineWords) * total));
    const at = found >= 0 ? found : Math.max(cursor, estimate);
    starts.push(words[at]?.start ?? 0);
    cursor = Math.min(total - 1, at + Math.max(1, lw.length - 1));
    proportional += lw.length;
  });
  const hookEnd = Math.max(3, starts[1] ?? voiceEnd);
  const scenes: Scene[] = [];
  const contentEnd = disclosure ? duration - 1 : duration;
  lines.forEach((text, i) => {
    const start = i === 0 ? 0 : Math.max(starts[i]!, hookEnd);
    const end = i + 1 < lines.length ? Math.max(starts[i + 1]!, i === 0 ? hookEnd : 0) : contentEnd;
    if (end - start > 0.05) scenes.push({ index: scenes.length, kind: i === 0 ? "hook" : "line", text, start, end: Math.min(end, contentEnd) });
  });
  // Lines squeezed out by the hook's three seconds still show, briefly, in order.
  const fixed: Scene[] = [];
  for (const s of scenes) {
    const prev = fixed[fixed.length - 1];
    const start = prev ? Math.max(s.start, prev.end) : s.start;
    if (s.end - start > 0.05) fixed.push({ ...s, index: fixed.length, start });
  }
  if (disclosure) fixed.push({ index: fixed.length, kind: "disclosure", text: "", start: contentEnd, end: duration });
  return fixed;
}

export function buildTimeline(lines: readonly string[], words: readonly Word[], options: { perSegment?: number; disclosure: boolean; tail?: number }): Timeline {
  const voiceEnd = words.length ? words[words.length - 1]!.end : 0;
  const duration = Math.round((voiceEnd + (options.tail ?? 0.5) + (options.disclosure ? 1 : 0)) * 1000) / 1000;
  const captions = captionSegments(words, options.perSegment ?? 3).map((c) => ({ ...c, end: Math.min(c.end, voiceEnd + 0.3) }));
  return { duration, voiceEnd, words: [...words], captions, scenes: scenesFor(lines, words, voiceEnd, duration, options.disclosure) };
}

const stamp = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

export function toSrt(segments: readonly Segment[]): string {
  return segments.map((s, i) => `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join("\n");
}
