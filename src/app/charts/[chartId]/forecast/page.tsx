"use client";

/**
 * Forecast page (TASK-0015): for one chart, a stretch of the past or the future, every timing signal ranked, with
 * the library's words for each. Looking back, each period can be marked as recognised or not: the marks show which
 * techniques hold, and tune the weights. It says when, and which part of life; never what will happen.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RefreshCw, Telescope } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChart } from "@/hooks/use-charts";
import { KEY, NOTABLE, NO_BIRTH_TIME, type Forecast, type Indicator, type Meaning } from "@/forecast/types";

type Mode = "back" | "ahead";
interface Mark {
  key: string;
  verdict: "yes" | "no";
  label: string;
  technique: string;
  score: number;
}

const YEAR = 365.2422 * 86_400_000;
const PRESETS: Record<Mode, { id: string; label: string; years: number }[]> = {
  back: [
    { id: "1", label: "Last year", years: 1 },
    { id: "5", label: "Last 5 years", years: 5 },
    { id: "10", label: "Last 10 years", years: 10 },
    { id: "20", label: "Last 20 years", years: 20 },
  ],
  ahead: [
    { id: "0.25", label: "Next 3 months", years: 0.25 },
    { id: "1", label: "Next year", years: 1 },
    { id: "3", label: "Next 3 years", years: 3 },
    { id: "5", label: "Next 5 years", years: 5 },
  ],
};
const TECHNIQUE_LABEL: Record<Indicator["technique"], string> = { transit: "Transit", progression: "Progression", "solar-arc": "Solar arc", eclipse: "Eclipse" };
const TECHNIQUE_ID: Record<Indicator["technique"], string> = {
  transit: "techniques/transits",
  progression: "techniques/secondary_progressions",
  "solar-arc": "techniques/solar_arc_directions",
  eclipse: "techniques/eclipses",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// the aspect as astrologers say it between two bodies: "Pluto conjunct your Uranus", "Saturn opposite your Moon"
const AS_VERB: Record<Indicator["aspect"], string> = { conjunction: "conjunct", opposition: "opposite", square: "square", trine: "trine", sextile: "sextile" };

/** "Saturn square your Sun", "Saturn return", "Total solar eclipse on your Moon". */
function titleOf(ind: Indicator): string {
  if (ind.returnOf) return `${ind.returnOf} return`;
  if (ind.technique === "eclipse") return `${cap(ind.mover)} ${ind.aspect === "conjunction" ? "on" : "opposite"} your ${ind.target.name}`;
  return `${cap(ind.mover)} ${AS_VERB[ind.aspect]} your ${ind.target.name}`;
}

function tierOf(score: number): "key" | "notable" | "other" {
  return score >= KEY ? "key" : score >= NOTABLE ? "notable" : "other";
}

function Meanings({ ind, meanings }: { ind: Indicator; meanings: Forecast["meanings"] }) {
  const rows: { label: string; m: Meaning | undefined; useDomains?: boolean }[] = [
    { label: TECHNIQUE_LABEL[ind.technique], m: meanings[TECHNIQUE_ID[ind.technique]] },
    { label: "What moves", m: ind.moverId ? meanings[ind.moverId] : undefined },
    { label: "How", m: meanings[`aspects/${ind.aspect}`] },
    { label: `Your ${ind.target.name}`, m: meanings[ind.target.id] },
    { label: ind.target.house ? `Its house, the ${ord(ind.target.house)}` : "", m: ind.target.house ? meanings[`houses/house_${ind.target.house}`] : undefined, useDomains: true },
  ];
  return (
    <details className="pt-2">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">What the library says</summary>
      <dl className="space-y-1.5 pt-2">
        {rows
          .filter((r) => r.m && r.label)
          .map((r) => (
            <div key={r.label}>
              <dt className="text-[11px] font-semibold text-ink-secondary">
                {r.label}
                {r.m!.draft && <span className="ml-1.5 rounded border border-line px-1 text-[10px] font-normal text-ink-muted">draft entry</span>}
              </dt>
              <dd className="font-serif text-xs leading-relaxed text-ink-secondary">{r.useDomains ? r.m!.domains.join(", ") : r.m!.definition}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}

function IndicatorCard({ ind, meanings, mode, mark, onMark }: { ind: Indicator; meanings: Forecast["meanings"]; mode: Mode; mark: Mark | undefined; onMark: (verdict: "yes" | "no" | null) => void }) {
  const width = Math.min(100, (ind.score / 30) * 100);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{titleOf(ind)}</h3>
          <p className="pt-0.5 text-xs text-ink-muted">
            {monthYear(ind.start)} – {monthYear(ind.end)}
            {ind.exact.length > 0 && <> · exact {ind.exact.map(day).join(", ")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-secondary">{TECHNIQUE_LABEL[ind.technique]}</span>
          <span className="text-xs tabular-nums text-ink-secondary" title="Weight: what moves, the aspect, the point, the time lords and how many techniques agree">
            {ind.score.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="mt-2 h-1 w-full rounded bg-line">
        <div className="h-1 rounded bg-accent" style={{ width: `${width}%` }} />
      </div>
      {ind.reasons.length > 0 && <p className="pt-2 text-xs leading-relaxed text-ink-secondary">{cap(ind.reasons.join("; "))}.</p>}
      {ind.triggers.length > 0 && (
        <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">
          Days it is likeliest felt: {ind.triggers.map((t) => `${day(t.date)} (${t.what})`).join(", ")}.
        </p>
      )}
      <Meanings ind={ind} meanings={meanings} />
      {mode === "back" && (
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <Button size="sm" variant={mark?.verdict === "yes" ? "primary" : "outline"} onClick={() => onMark(mark?.verdict === "yes" ? null : "yes")}>
            I recognise this period
          </Button>
          <Button size="sm" variant={mark?.verdict === "no" ? "primary" : "outline"} onClick={() => onMark(mark?.verdict === "no" ? null : "no")}>
            Not really
          </Button>
        </div>
      )}
    </Card>
  );
}

function LookBackScore({ forecast, marks, persisted }: { forecast: Forecast; marks: Mark[]; persisted: boolean }) {
  const byKey = new Map(marks.map((m) => [m.key, m]));
  const marked = forecast.indicators.filter((i) => byKey.has(i.key));
  const rate = (list: Indicator[]) => {
    const yes = list.filter((i) => byKey.get(i.key)?.verdict === "yes").length;
    return list.length ? `${yes} of ${list.length}` : "none marked";
  };
  const groups: [string, Indicator[]][] = [
    ["Key periods", marked.filter((i) => tierOf(i.score) === "key")],
    ["Notable periods", marked.filter((i) => tierOf(i.score) === "notable")],
    ["Other signals", marked.filter((i) => tierOf(i.score) === "other")],
    ...(Object.keys(TECHNIQUE_LABEL) as Indicator["technique"][]).map((t) => [`${TECHNIQUE_LABEL[t]}s`, marked.filter((i) => i.technique === t)] as [string, Indicator[]]),
  ];
  return (
    <Card className="border-accent/30 p-5">
      <h2 className="text-sm font-semibold text-ink">The look-back test</h2>
      <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">
        Mark each period you remember as you lived it, or not. If the forecast works for this person, the key periods should be recognised far more often than the other signals.
      </p>
      <p className="pt-3 text-sm text-ink">
        Recognised: <strong>{rate(marked)}</strong> marked periods.
      </p>
      <ul className="grid gap-x-6 gap-y-1 pt-2 text-xs text-ink-secondary sm:grid-cols-2">
        {groups.map(([label, list]) => (
          <li key={label}>
            {label}: {rate(list)}
          </li>
        ))}
      </ul>
      {!persisted && (
        <p className="pt-3 text-xs text-ink-muted">
          These marks are kept in the server&rsquo;s memory only, and will be lost when it restarts: run the <code>202611010010_forecast_marks.sql</code> migration in Supabase to save them.
        </p>
      )}
    </Card>
  );
}

export default function ForecastPage() {
  const { chartId } = useParams<{ chartId: string }>();
  const { data: chart } = useChart(chartId);
  const person = chart ? `${chart.person.firstName} ${chart.person.lastName}` : "";
  const noBirthTime = chart !== undefined && !(chart.birth.timeKnown && chart.birth.time);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("back");
  const [preset, setPreset] = useState<string>("10");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [elsewhere, setElsewhere] = useState<{ on: boolean; latitude: string; longitude: string; label: string }>({ on: false, latitude: "", longitude: "", label: "" });
  const [showOther, setShowOther] = useState(false);
  const [releasingYear, setReleasingYear] = useState<"valens" | "calendar">("valens");

  const range = useMemo(() => {
    if (preset === "custom") return custom.from && custom.to ? { from: custom.from, to: custom.to } : null;
    const years = PRESETS[mode].find((p) => p.id === preset)?.years ?? 1;
    const now = Date.now();
    return mode === "back"
      ? { from: new Date(now - years * YEAR).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) }
      : { from: new Date(now).toISOString().slice(0, 10), to: new Date(now + years * YEAR).toISOString().slice(0, 10) };
  }, [mode, preset, custom]);

  const compute = useMutation({
    mutationFn: async (): Promise<Forecast> => {
      if (!range) throw new Error("Choose the dates.");
      const response = await fetch(`/api/charts/${chartId}/forecast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          from: range.from,
          to: range.to,
          solarReturnAt: elsewhere.on ? { latitude: Number(elsewhere.latitude), longitude: Number(elsewhere.longitude), label: elsewhere.label } : null,
          releasingYear,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "The forecast could not be computed.");
      return body as Forecast;
    },
  });
  const forecast = compute.data;

  const marks = useQuery({
    queryKey: ["forecast-marks", chartId],
    queryFn: async (): Promise<{ marks: Mark[]; persisted: boolean }> => {
      const response = await fetch(`/api/charts/${chartId}/forecast/marks`);
      if (!response.ok) return { marks: [], persisted: false };
      return response.json();
    },
  });
  const setMark = useMutation({
    mutationFn: async ({ ind, verdict }: { ind: Indicator; verdict: "yes" | "no" | null }) => {
      const response = await fetch(`/api/charts/${chartId}/forecast/marks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: ind.key, verdict, label: `${titleOf(ind)}, ${monthYear(ind.start)}–${monthYear(ind.end)}`, technique: ind.technique, score: ind.score }),
      });
      if (!response.ok) throw new Error("The mark could not be saved.");
      return response.json();
    },
    onSuccess: (answer) => queryClient.setQueryData(["forecast-marks", chartId], answer),
  });
  const markByKey = new Map((marks.data?.marks ?? []).map((m) => [m.key, m]));

  const key = forecast?.indicators.filter((i) => tierOf(i.score) === "key") ?? [];
  const notable = forecast?.indicators.filter((i) => tierOf(i.score) === "notable") ?? [];
  const other = forecast?.indicators.filter((i) => tierOf(i.score) === "other") ?? [];
  const card = (ind: Indicator) => (
    <IndicatorCard key={ind.key} ind={ind} meanings={forecast!.meanings} mode={forecast!.mode} mark={markByKey.get(ind.key)} onMark={(verdict) => setMark.mutate({ ind, verdict })} />
  );

  return (
    <AppShell>
      <PageHeader title="Forecast" crumbs={[{ label: "Birth Charts", href: "/charts" }, { label: person || "Chart", href: `/charts/${chartId}` }, { label: "Forecast" }]} />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {noBirthTime && (
            <Card className="p-5">
              <p className="font-serif text-sm leading-relaxed text-ink-secondary">{NO_BIRTH_TIME}</p>
              <p className="pt-3 text-xs">
                <Link href={`/charts/${chartId}`} className="text-accent underline underline-offset-2">
                  Back to {person || "the birth chart"}
                </Link>
              </p>
            </Card>
          )}
          {!noBirthTime && (
          <Card className="p-5">
            <p className="font-serif text-sm leading-relaxed text-ink-secondary">
              When, and which part of life: the forecast times what the birth chart already holds. It never says what will happen.
            </p>
            <div className="flex flex-wrap gap-2 pt-4">
              <Button size="sm" variant={mode === "back" ? "primary" : "outline"} onClick={() => { setMode("back"); setPreset("10"); }}>
                <History size={13} /> Look back
              </Button>
              <Button size="sm" variant={mode === "ahead" ? "primary" : "outline"} onClick={() => { setMode("ahead"); setPreset("1"); }}>
                <Telescope size={13} /> Look ahead
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-3">
              {PRESETS[mode].map((p) => (
                <Button key={p.id} size="sm" variant={preset === p.id ? "accent-outline" : "ghost"} onClick={() => setPreset(p.id)}>
                  {p.label}
                </Button>
              ))}
              <Button size="sm" variant={preset === "custom" ? "accent-outline" : "ghost"} onClick={() => setPreset("custom")}>
                Choose dates
              </Button>
            </div>
            {preset === "custom" && (
              <div className="flex flex-wrap gap-3 pt-3 text-xs text-ink-secondary">
                <label className="grid gap-1">
                  From
                  <input type="date" className="rounded border border-line bg-transparent px-2 py-1 text-ink" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  To
                  <input type="date" className="rounded border border-line bg-transparent px-2 py-1 text-ink" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 pt-4 text-xs text-ink-secondary">
              <input type="checkbox" checked={elsewhere.on} onChange={(e) => setElsewhere({ ...elsewhere, on: e.target.checked })} />
              Cast the solar returns where the person lives, not at the birthplace
            </label>
            {elsewhere.on && (
              <div className="flex flex-wrap gap-3 pt-2 text-xs text-ink-secondary">
                <label className="grid gap-1">
                  Place
                  <input className="rounded border border-line bg-transparent px-2 py-1 text-ink" placeholder="Lyon" value={elsewhere.label} onChange={(e) => setElsewhere({ ...elsewhere, label: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  Latitude
                  <input className="w-28 rounded border border-line bg-transparent px-2 py-1 text-ink" placeholder="45.76" value={elsewhere.latitude} onChange={(e) => setElsewhere({ ...elsewhere, latitude: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  Longitude (east +)
                  <input className="w-28 rounded border border-line bg-transparent px-2 py-1 text-ink" placeholder="4.84" value={elsewhere.longitude} onChange={(e) => setElsewhere({ ...elsewhere, longitude: e.target.value })} />
                </label>
              </div>
            )}
            <label className="flex flex-wrap items-center gap-2 pt-4 text-xs text-ink-secondary">
              Life chapters (zodiacal releasing) count
              <select className="rounded border border-line bg-transparent px-2 py-1 text-ink" value={releasingYear} onChange={(e) => setReleasingYear(e.target.value === "calendar" ? "calendar" : "valens")}>
                <option value="valens">years of 360 days, as Valens does</option>
                <option value="calendar">calendar years</option>
              </select>
            </label>
            <div className="flex items-center gap-3 pt-4">
              <Button variant="primary" size="sm" disabled={!range || compute.isPending} onClick={() => compute.mutate()}>
                {compute.isPending ? <RefreshCw size={13} className="animate-spin" /> : null}
                {forecast ? "Recalculate" : "Calculate"}
              </Button>
              {range && <span className="text-xs text-ink-muted">{day(range.from)} – {day(range.to)}</span>}
            </div>
            {compute.isError && <p className="pt-2 text-xs text-danger">{compute.error instanceof Error ? compute.error.message : "The forecast failed."}</p>}
          </Card>
          )}

          {compute.isPending && <Skeleton className="h-64 w-full rounded-card" />}

          {forecast && (
            <>
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-ink">
                  {key.length} key {key.length === 1 ? "period" : "periods"}, {notable.length} notable
                </h2>
                <p className="pt-1 text-xs text-ink-muted">
                  {day(forecast.from)} – {day(forecast.to)} · solar returns cast at {forecast.settings.solarReturnAt} · life chapters in {forecast.settings.releasingYear} · orbs: {Object.entries(forecast.settings.orbs).map(([k, v]) => `${k} ${v}`).join("; ")}
                </p>
                {forecast.limits.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 pt-3 text-xs text-ink-secondary">
                    {forecast.limits.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </Card>

              {forecast.mode === "back" && <LookBackScore forecast={forecast} marks={marks.data?.marks ?? []} persisted={marks.data?.persisted ?? false} />}

              {(forecast.years.length > 0 || forecast.solarReturns.length > 0) && (
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-ink">The years</h2>
                  <p className="pt-1 text-xs leading-relaxed text-ink-muted">{forecast.meanings["techniques/annual_profections"]?.definition}</p>
                  <ul className="space-y-3 pt-3">
                    {forecast.years.map((y) => {
                      const sr = forecast.solarReturns.find((r) => Math.abs(Date.parse(r.date) - Date.parse(y.start)) < 3 * 86_400_000);
                      return (
                        <li key={y.start} className="text-xs leading-relaxed text-ink-secondary">
                          <p className="text-sm text-ink">
                            {day(y.start)} – {day(y.end)} · age {y.age}: a {ord(y.house)}-house year ({y.sign}), lord of the year {y.lord}
                            {y.coLord ? ` (and ${y.coLord} in modern tropical astrology)` : ""}
                          </p>
                          {y.lordPosition && <p>{y.lord} in the birth chart: {y.lordPosition}.</p>}
                          <p className="font-serif">{forecast.meanings[`houses/house_${y.house}`]?.domains.join(", ")}</p>
                          {sr && (
                            <p className="pt-1">
                              Solar return {day(sr.date)} ({sr.place}): Ascendant {sr.ascendant}
                              {sr.ascendantInNatalHouse ? `, in your ${ord(sr.ascendantInNatalHouse)} house` : ""}; Sun in the return&rsquo;s {ord(sr.sunHouse)} house, Moon in its {ord(sr.moonHouse)}
                              {sr.angular.length ? `; on the return's angles: ${sr.angular.join(", ")}` : ""}.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}

              {(forecast.releasing.spirit.length > 0 || forecast.releasing.fortune.length > 0) && (
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-ink">Life chapters</h2>
                  <p className="pt-1 text-xs leading-relaxed text-ink-muted">{forecast.meanings["techniques/zodiacal_releasing"]?.definition} From the Lot of Spirit: work and what you set out to do; from the Lot of Fortune: circumstances.</p>
                  {(["spirit", "fortune"] as const).map((lot) => (
                    <div key={lot} className="pt-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">From the Lot of {cap(lot)}</h3>
                      <ul className="space-y-1 pt-1.5 text-xs text-ink-secondary">
                        {forecast.releasing[lot].map((p) => (
                          <li key={`${p.level}-${p.start}`} className={p.level === 1 ? "font-semibold text-ink" : "pl-4"}>
                            {p.level === 1 ? "Chapter" : "Sub-period"}: {p.sign} ({ord(p.house)} house, ruled by {p.ruler}), {monthYear(p.start)} – {monthYear(p.end)}
                            {p.peak === "highest" ? " · highest peak" : p.peak ? " · peak" : ""}
                            {p.loosing ? " · loosing of the bond" : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Card>
              )}

              {key.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Key periods</h2>
                  {key.map(card)}
                </section>
              )}
              {notable.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Notable periods</h2>
                  {notable.map(card)}
                </section>
              )}
              {other.length > 0 && (
                <section className="space-y-3">
                  <Button size="sm" variant="ghost" onClick={() => setShowOther(!showOther)}>
                    {showOther ? "Hide" : "Show"} the {other.length} weaker signals
                  </Button>
                  {showOther && other.map(card)}
                </section>
              )}

              {forecast.milestones.length > 0 && (
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-ink">Milestones</h2>
                  <ul className="space-y-1 pt-2 text-xs text-ink-secondary">
                    {forecast.milestones.map((m) => (
                      <li key={`${m.date}-${m.text}`}>
                        {day(m.date)}: {m.text}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <p className="text-[11px] leading-relaxed text-ink-faint">
                Tendencies, not fate: timing activates what the birth chart holds; it does not create events. Methods: Robert Hand, Planets in Transit (1976); Steven Forrest, The Changing Sky (1986); Noel Tyl, Solar Arcs (2001); Vettius Valens, Anthology, Book IV, and Chris Brennan, Hellenistic Astrology (2017), for profections and zodiacal releasing; Abu Ma&rsquo;shar, On the Revolutions of the Years of Nativities (trans. B. Dykes, 2019), for solar returns. Positions: astronomy-engine, tropical zodiac, true ecliptic of date; Chiron from its orbit, computed from its position and speed on 1 January 2000 under the pull of the Sun and the planets (1900–2100).
              </p>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
