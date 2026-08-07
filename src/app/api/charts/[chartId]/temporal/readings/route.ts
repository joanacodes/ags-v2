/**
 * POST /api/charts/:chartId/temporal/readings — generates THE YEARS AHEAD
 * reading from the cached temporal data (Saturn return, six solar returns,
 * secondary progressions), grounded in the validated technique entries and
 * the core vocabulary. GET returns the saved reading.
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { createCoreKnowledgeRegistry } from "@/knowledge/pack-loader";
import type { KnowledgeRegistry } from "@/knowledge/registry";
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";

export const maxDuration = 60;

const DATA_SLUG = "_temporal";
const READING_SLUG = "_temporal_reading";
const MODEL = "claude-sonnet-4-5";

/* ------------------------- storage helpers -------------------------- */

async function readSlug(chartId: string, slug: string): Promise<unknown | null> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) return null;
  const { data } = await supabase
    .from("readings")
    .select("reading")
    .eq("chart_id", chartId)
    .eq("slug", slug)
    .maybeSingle();
  return data?.reading ?? null;
}

async function writeSlug(chartId: string, slug: string, value: unknown): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const userId = await getServerUserId();
  if (supabase === null || userId === null) return false;
  const { error } = await supabase.from("readings").upsert(
    {
      chart_id: chartId,
      user_id: userId,
      slug,
      reading: value,
      engine_version: "temporal-reading-1.0",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chart_id,slug" },
  );
  return error === null;
}

/* --------------------- placement extraction ------------------------- */

const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

interface Placement {
  body: string;
  sign: string;
  retro: boolean;
}

function signFromAbs(abs: number): string {
  return SIGN_NAMES[Math.floor((((abs % 360) + 360) % 360) / 30)] ?? "";
}

const SIGN_BY_PREFIX = new Map(SIGN_NAMES.map((name) => [name.slice(0, 3).toLowerCase(), name]));

function normalizeSign(value: string): string {
  const full = SIGN_NAMES.find((name) => name.toLowerCase() === value.toLowerCase());
  if (full !== undefined) return full;
  return SIGN_BY_PREFIX.get(value.slice(0, 3).toLowerCase()) ?? value;
}

/** Recursively find planet placements in an unknown provider payload. */
function extractPlacements(data: unknown): Placement[] {
  const found: Placement[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || typeof node !== "object" || node === null || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    const name = record.name ?? record.body ?? record.planet;
    const sign = record.sign ?? record.sign_id;
    const abs = record.abs_pos ?? record.pos;
    if (
      typeof name === "string" &&
      !/^\d+$/.test(name) &&
      (typeof sign === "string" || typeof abs === "number")
    ) {
      const signName =
        typeof sign === "string" ? normalizeSign(sign) : signFromAbs(abs as number);
      if (SIGN_NAMES.includes(signName) && !found.some((p) => p.body.toLowerCase() === name.toLowerCase())) {
        found.push({
          body: name.charAt(0).toUpperCase() + name.slice(1),
          sign: signName,
          retro: record.retrograde === true,
        });
      }
    }
    for (const value of Object.values(record)) visit(value, depth + 1);
  };
  visit(data, 0);
  return found;
}

function extractMoment(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const meta = (data as Record<string, unknown>).meta as Record<string, unknown> | undefined;
  for (const key of ["solar_return", "return_event"]) {
    const block = meta?.[key] as Record<string, unknown> | undefined;
    const moment = block?.exact_moment_local ?? block?.exact_moment_utc;
    if (typeof moment === "string") return moment;
  }
  return null;
}

/* --------------------- grounded sentence layer ---------------------- */

function identityOf(registry: KnowledgeRegistry, key: string): { fn?: string; domains?: string[] } {
  const resolution = registry.resolve(key);
  if (resolution.status !== "resolved") return {};
  const identity = resolution.record.modules.identity as
    | { canonicalFunction?: string; coreDomains?: string[] }
    | undefined;
  return { fn: identity?.canonicalFunction, domains: identity?.coreDomains };
}

const CORE_BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

function placementSentences(registry: KnowledgeRegistry, placements: Placement[]): string[] {
  const sentences: string[] = [];
  for (const placement of placements) {
    if (!CORE_BODIES.includes(placement.body)) continue;
    const planet = identityOf(registry, `planets/${placement.body.toLowerCase()}`);
    const sign = identityOf(registry, `signs/${placement.sign.toLowerCase()}`);
    if (planet.fn === undefined || sign.domains === undefined) continue;
    let sentence = `${placement.body} in ${placement.sign} — ${placement.body} ${planet.fn}; ${placement.sign} carries the domains of ${sign.domains.slice(0, 3).join(", ").replace(/_/g, " ")}`;
    if (placement.retro) {
      const retro = identityOf(registry, "conditions/retrograde");
      if (retro.fn !== undefined) sentence += `; retrograde, it ${retro.fn}`;
    }
    sentences.push(`${sentence}.`);
  }
  return sentences;
}

/* ----------------------------- AI call ------------------------------ */

interface TemporalSection {
  heading: string;
  paragraphs: string[];
}

async function callAi(prompt: string): Promise<
  { ok: true; sections: TemporalSection[] } | { ok: false; error: string }
> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    return { ok: false, error: `Anthropic API ${response.status}: ${(await response.text()).slice(0, 200)}` };
  }
  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("");
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { sections?: TemporalSection[] };
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return { ok: true, sections: parsed.sections };
    }
    return { ok: false, error: "AI returned no sections." };
  } catch {
    return { ok: false, error: "AI response was not valid JSON." };
  }
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English", fr: "French", es: "Spanish", pt: "Portuguese", de: "German", it: "Italian",
};

/* ------------------------------ routes ------------------------------ */

export async function GET(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  const saved = await readSlug(params.chartId, READING_SLUG);
  return NextResponse.json({ reading: saved });
}

export async function POST(
  _request: Request,
  { params }: { params: { chartId: string } },
) {
  try {
    const chart = await ChartsStore.getChart(params.chartId);
    const temporal = (await readSlug(chart.id, DATA_SLUG)) as {
      saturnReturn?: { ok?: boolean; data?: { previous?: unknown; next?: unknown } };
      solarReturns?: { year: number; ok?: boolean; data?: unknown }[];
      progressions?: { ok?: boolean; data?: unknown };
    } | null;
    if (temporal === null) {
      return NextResponse.json(
        { error: { code: "NO_TEMPORAL_DATA", message: "Open the Temporal page first so the cycles are computed." } },
        { status: 409 },
      );
    }

    const registry = createCoreKnowledgeRegistry();
    const lines: string[] = [];

    const saturnDef = identityOf(registry, "techniques/saturn_return").fn ?? "";
    lines.push(`## Saturn Return — technique: ${saturnDef}.`);
    const saturnData = temporal.saturnReturn?.data;
    for (const key of ["previous", "next"] as const) {
      const sub = saturnData?.[key];
      if (sub == null) continue;
      const moment = extractMoment(sub);
      if (moment !== null) lines.push(`- ${key === "previous" ? "Previous" : "Next"} exact return: ${moment.slice(0, 10)}.`);
    }
    const natalSaturn = chart.planets.find((p) => p.planet === "Saturn");
    if (natalSaturn !== undefined) {
      lines.push(`- Natal Saturn: ${natalSaturn.sign}, house ${natalSaturn.house}.`);
      lines.push(...placementSentences(registry, [{ body: "Saturn", sign: natalSaturn.sign, retro: natalSaturn.retrograde === true }]));
    }

    const solarDef = identityOf(registry, "techniques/solar_return").fn ?? "";
    lines.push(`\n## Solar Returns — technique: ${solarDef}.`);
    for (const entry of temporal.solarReturns ?? []) {
      if (entry.ok !== true) continue;
      const placements = extractPlacements(entry.data).filter((p) => ["Sun", "Moon", "Venus", "Mars", "Saturn", "Jupiter"].includes(p.body));
      const moment = extractMoment(entry.data);
      lines.push(`\n### Year ${entry.year}${moment !== null ? ` (exact return ${moment.slice(0, 10)})` : ""}`);
      lines.push(...placementSentences(registry, placements).map((sentence) => `- ${sentence}`));
    }

    const progDef = identityOf(registry, "techniques/secondary_progressions").fn ?? "";
    lines.push(`\n## Secondary Progressions — technique: ${progDef}.`);
    const progressed = extractPlacements(temporal.progressions?.data).filter((p) => CORE_BODIES.includes(p.body));
    lines.push(...placementSentences(registry, progressed).map((sentence) => `- Progressed ${sentence}`));

    const language = LANGUAGE_NAMES[chart.configuration.language ?? "en"] ?? "English";
    const person = `${chart.person.firstName} ${chart.person.lastName}`;
    const prompt = [
      `You are a teaching astrologer writing for a total beginner named ${person}.`,
      `Write in ${language}. STYLE: clinical — precise, warm, plainly factual, no predictions of events, no fatalism.`,
      "Use ONLY the grounded material below; never invent astrological meanings beyond it.",
      "Explain each mechanic inline in one clause the first time it appears.",
      "Every technique paragraph must include one concrete everyday example introduced naturally.",
      "",
      "Return STRICT JSON only, no markdown fences, in this shape:",
      '{"sections":[{"heading":"...","paragraphs":["...","..."]}]}',
      "Sections required, in order: (1) 'At a glance' — 3-4 sentence summary of the years ahead;",
      "(2) 'Your Saturn Return' ; (3) one section per solar year titled 'Year YYYY' (2-3 paragraphs each);",
      "(4) 'Your Inner Evolution' about the progressions; (5) 'How to use this' — practical closing.",
      "",
      "GROUNDED MATERIAL:",
      ...lines,
    ].join("\n");

    const ai = await callAi(prompt);
    if (!ai.ok) {
      return NextResponse.json({ error: { code: "AI_FAILED", message: ai.error } }, { status: 502 });
    }
    const reading = {
      title: "The Years Ahead",
      sections: ai.sections,
      model: MODEL,
      generatedAt: new Date().toISOString(),
    };
    await writeSlug(chart.id, READING_SLUG, reading);
    return NextResponse.json({ reading }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "TEMPORAL_READING_FAILED", message } }, { status: 500 });
  }
}
