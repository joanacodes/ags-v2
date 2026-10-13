/**
 * Synastry between two charts (either order: the pair is normalised).
 *   GET    → both people, the contacts and house overlays, the reading if
 *            written, and the background job state
 *   POST   { style, language } → write (or rewrite) the reading: queued on
 *            the server when background generation is set up, else written
 *            now and returned
 *   DELETE → remove the synastry
 */
import { NextResponse } from "next/server";
import { ChartsStore } from "@/server/charts-store";
import { PromptsStore } from "@/server/prompts-store";
import { SynastryStore, synastryPair } from "@/server/synastry-store";
import { BackgroundUnavailableError, GenerationJobs } from "@/server/generation-jobs";
import { allowFallbackFrom } from "@/interpretation/ai-models";
import { contactLabel, overlayLabel, synastryOverview } from "@/interpretation/synastry";
import { generateSynastryReading, pairNames, pendingSynastry } from "@/interpretation/synastry-pipeline";
import { ASPECT_GLYPHS, PLANET_GLYPHS } from "@/interpretation/reading-pipeline";
import { formatOrb } from "@/interpretation/point-contacts";
import { formatBirthMoment } from "@/lib/format";
import type { Chart } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STYLES = ["clinical", "poetic", "conversational"];
const LANGUAGES = ["en", "fr", "es", "pt", "de", "it"];

type Params = { params: { a: string; b: string } };

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function person(chart: Chart) {
  const sign = (name: string) => chart.planets.find((p) => p.planet === name)?.sign;
  return {
    id: chart.id,
    name: `${chart.person.firstName} ${chart.person.lastName}`.trim(),
    firstName: chart.person.firstName,
    birthLine: [formatBirthMoment(chart.birth.date, chart.birth.timeKnown ? chart.birth.time : undefined), chart.birth.place]
      .filter((part) => part.length > 0)
      .join(" · "),
    sun: sign("Sun"),
    moon: sign("Moon"),
    asc: chart.angles.find((a) => a.point === "ASC")?.sign,
    calculated: chart.planets.length > 0,
  };
}

async function loadPair(params: Params["params"]) {
  const pair = synastryPair(decodeURIComponent(params.a), decodeURIComponent(params.b));
  if (pair.owner === pair.partner) return { error: fail("SAME_CHART", "Pick two different people.", 400) } as const;
  try {
    const [owner, partner] = await Promise.all([ChartsStore.getChart(pair.owner), ChartsStore.getChart(pair.partner)]);
    return { pair, owner, partner } as const;
  } catch {
    return { error: fail("CHART_NOT_FOUND", "One of the two charts doesn't exist anymore.", 404) } as const;
  }
}

export async function GET(_request: Request, { params }: Params) {
  const loaded = await loadPair(params);
  if ("error" in loaded) return loaded.error;
  const { pair, owner, partner } = loaded;
  const names = pairNames(owner, partner);
  const overview = synastryOverview(owner, partner);
  const [reading, job] = await Promise.all([
    SynastryStore.get(pair.owner, pair.partner),
    GenerationJobs.jobFor(pair.owner, pair.slug),
  ]);
  return NextResponse.json({
    owner: person(owner),
    partner: person(partner),
    names,
    contacts: overview.contacts.map((c) => ({
      label: contactLabel(names[0], names[1], c),
      glyphs: `${PLANET_GLYPHS[c.a] ?? c.a} ${PLANET_GLYPHS[c.b] ?? c.b}`,
      aspectGlyph: ASPECT_GLYPHS[c.type] ?? c.type,
      type: c.type,
      orb: formatOrb(c.orb),
    })),
    overlays: {
      ownerInPartner: overview.aInB.map((o) => ({ label: overlayLabel(names[0], names[1], o), house: o.house })),
      partnerInOwner: overview.bInA.map((o) => ({ label: overlayLabel(names[1], names[0], o), house: o.house })),
    },
    timeKnown: { owner: overview.aTimeKnown, partner: overview.bTimeKnown },
    reading: reading?.status === "complete" ? reading : null,
    job,
  });
}

export async function POST(request: Request, { params }: Params) {
  const loaded = await loadPair(params);
  if ("error" in loaded) return loaded.error;
  const { pair, owner, partner } = loaded;
  if (owner.planets.length === 0 || partner.planets.length === 0) {
    return fail("CHART_NOT_CALCULATED", "Both charts must be calculated first.", 409);
  }
  if (ChartsStore.isSample(pair.owner)) {
    return fail("SAMPLE_PAIR", "Pick at least one of your own charts: sample charts can't be saved.", 400);
  }
  const body = (await request.json().catch(() => ({}))) as { style?: string; language?: string };
  const style = STYLES.includes(body.style ?? "") ? (body.style as string) : "conversational";
  const language = LANGUAGES.includes(body.language ?? "") ? (body.language as string) : "en";

  // The stored record names both charts: the background runner needs it.
  const existing = await SynastryStore.get(pair.owner, pair.partner);
  if (existing === null) await SynastryStore.save(owner, pendingSynastry(owner, partner));

  try {
    await GenerationJobs.enqueueOne(pair.owner, pair.slug, style, language);
    return NextResponse.json({ status: "queued" });
  } catch (error) {
    if (!(error instanceof BackgroundUnavailableError)) {
      return fail("ENQUEUE_FAILED", error instanceof Error ? error.message : "Could not start.", 500);
    }
  }

  // No background generation: write it now.
  const outcome = await generateSynastryReading(owner, partner, style, language, {
    prompts: await PromptsStore.getPrompts(),
    allowFallback: allowFallbackFrom(request),
  });
  if (outcome.status === "ok") {
    await SynastryStore.save(owner, outcome.reading);
    return NextResponse.json({ status: "done", reading: outcome.reading });
  }
  if (existing === null) await SynastryStore.remove(pair.owner, pair.partner);
  if (outcome.status === "refused") return fail("AI_REFUSED", outcome.message, 422);
  if (outcome.status === "no_api_key") return fail("AI_NOT_CONFIGURED", "No AI key on the server.", 503);
  if (outcome.status === "no_placements") return fail("CHART_NOT_CALCULATED", "Both charts must be calculated first.", 409);
  return fail("AI_PROVIDER_ERROR", outcome.message, 502);
}

export async function DELETE(_request: Request, { params }: Params) {
  const pair = synastryPair(decodeURIComponent(params.a), decodeURIComponent(params.b));
  await SynastryStore.remove(pair.owner, pair.partner);
  return NextResponse.json({ ok: true });
}
