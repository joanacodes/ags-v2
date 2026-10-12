"use client";

/**
 * Temporal page (TASK-0011): Saturn return, the next six solar returns,
 * and current secondary progressions. Provider payload shapes are rendered
 * defensively; upstream errors are shown verbatim for fast diagnosis.
 */
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Hourglass, RefreshCw, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChart } from "@/hooks/use-charts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { renderInline } from "@/lib/rich-text";
import { notify } from "@/components/common/toaster";
import { aiFetch } from "@/lib/ai-fetch";

interface CallResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
interface TemporalReading {
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
  generatedAt: string;
}

interface TemporalPayload {
  generatedAt: string;
  grounding?: { saturnReturn: string; solarReturn: string; progressions: string };
  saturnReturn: CallResult;
  solarReturns: ({ year: number } & CallResult)[];
  progressions: CallResult;
}

/** Pulls displayable facts out of an unknown provider payload. */
function factsFrom(data: unknown): { label: string; value: string }[] {
  if (typeof data !== "object" || data === null) return [];
  const record = data as Record<string, unknown>;
  const facts: { label: string; value: string }[] = [];
  // Documented meta blocks (solar_return / return_event)
  const meta = record.meta as Record<string, unknown> | undefined;
  for (const [blockName, dateLabel] of [
    ["solar_return", "Exact return"],
    ["return_event", "Exact return"],
  ] as const) {
    const block = meta?.[blockName] as Record<string, unknown> | undefined;
    if (block === undefined) continue;
    const moment = block.exact_moment_local ?? block.exact_moment_utc;
    if (typeof moment === "string") {
      facts.push({ label: dateLabel, value: new Date(moment).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) });
    }
    if (typeof block.confidence === "string" && block.confidence !== "exact") {
      facts.push({ label: "Confidence", value: String(block.confidence) });
    }
  }
  // Saturn: previous / next event pair
  for (const key of ["previous", "next"] as const) {
    const sub = record[key];
    if (typeof sub === "object" && sub !== null) {
      const subMeta = (sub as Record<string, unknown>).meta as Record<string, unknown> | undefined;
      const event = subMeta?.return_event as Record<string, unknown> | undefined;
      const moment = event?.exact_moment_local ?? event?.exact_moment_utc;
      if (typeof moment === "string") {
        facts.push({ label: key === "previous" ? "Previous return" : "Next return", value: new Date(moment).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) });
      }
    }
  }
  for (const key of ["return_date", "date", "exact_date", "return_datetime", "next_return"]) {
    const value = record[key];
    if (typeof value === "string") facts.push({ label: "Date", value });
  }
  // Recursive hunt: the progression/return families nest their planet
  // arrays at different depths — find any array of {name, sign} objects.
  const seen = new Set<unknown>();
  const hunt = (node: unknown, depth: number) => {
    if (depth > 5 || facts.length > 24) return;
    if (typeof node !== "object" || node === null || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      const planetLike = node.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).sign === "string" &&
          ["name", "body", "planet"].some(
            (key) => typeof (item as Record<string, unknown>)[key] === "string",
          ),
      );
      if (planetLike.length >= 3) {
        const nameOf = (item: Record<string, unknown>) =>
          String(item.name ?? item.body ?? item.planet ?? "");
        const planets = planetLike.filter((item) => !/^\d+$/.test(nameOf(item)));
        const houses = planetLike.filter((item) => /^\d+$/.test(nameOf(item)));
        for (const planet of [...planets, ...houses].slice(0, 26)) {
          const rawName = String(planet.name ?? planet.body ?? planet.planet ?? "");
          const numeric = /^\d+$/.test(rawName);
          const pos = typeof planet.pos === "number" ? `${Math.floor(planet.pos % 30)}° ` : "";
          facts.push({
            label: numeric ? `House ${rawName}` : rawName,
            value: `${pos}${String(planet.sign)}${planet.retrograde === true ? " ℞" : ""}`,
          });
        }
        return;
      }
      for (const item of node) hunt(item, depth + 1);
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) hunt(value, depth + 1);
  };
  hunt(record, 0);
  return facts;
}

function ResultBlock({ result }: { result: CallResult }) {
  if (!result.ok) {
    return (
      <p className="rounded-lg border border-warning/40 bg-warning-soft/40 px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
        Provider response: {result.error ?? "unavailable"}
      </p>
    );
  }
  const facts = factsFrom(result.data);
  if (facts.length === 0) {
    const keys =
      typeof result.data === "object" && result.data !== null
        ? Object.keys(result.data as Record<string, unknown>).slice(0, 10).join(", ")
        : "";
    return (
      <p className="text-xs text-ink-muted">
        Computed — data received{keys !== "" ? ` (fields: ${keys})` : ""}. Send this
        field list to the developer to unlock the display.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
      {facts.map((fact, index) => (
        <div key={index} className="text-xs">
          <dt className="text-ink-faint">{fact.label}</dt>
          <dd className="text-ink-secondary">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function TemporalPage() {
  const params = useParams<{ chartId: string }>();
  const chartId = params.chartId;
  const { data: chart } = useChart(chartId);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["temporal", chartId],
    queryFn: async (): Promise<TemporalPayload> => {
      const response = await fetch(`/api/charts/${chartId}/temporal`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Temporal data unavailable.");
      }
      return (await response.json()) as TemporalPayload;
    },
    staleTime: 24 * 3600 * 1000,
  });

  const person = chart ? `${chart.person.firstName} ${chart.person.lastName}` : "";
  const queryClient = useQueryClient();

  const { data: savedReading } = useQuery({
    queryKey: ["temporal-reading", chartId],
    queryFn: async (): Promise<TemporalReading | null> => {
      const response = await fetch(`/api/charts/${chartId}/temporal/readings`);
      if (!response.ok) return null;
      const body = (await response.json()) as { reading: TemporalReading | null };
      return body.reading;
    },
  });

  const [genStep, setGenStep] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async (): Promise<TemporalReading> => {
      const call = async (part: 1 | 2): Promise<unknown> => {
        const response = await aiFetch(
          `/api/charts/${chartId}/temporal/readings?part=${part}`,
          { method: "POST" },
        );
        const text = await response.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error(`Server error (part ${part}): ${text.slice(0, 140)}`);
        }
        if (!response.ok) {
          const message = (body as { error?: { message?: string } }).error?.message;
          throw new Error(message ?? `Generation failed (part ${part}).`);
        }
        return body;
      };
      setGenStep("Writing the overview, Saturn return and evolution… (1/2)");
      await call(1);
      setGenStep("Writing the six solar years… (2/2)");
      const second = (await call(2)) as { reading: TemporalReading };
      setGenStep(null);
      return second.reading;
    },
    onError: () => setGenStep(null),
    onSuccess: (reading) => {
      queryClient.setQueryData(["temporal-reading", chartId], reading);
      notify("The Years Ahead reading generated.");
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="The Years Ahead"
        crumbs={[
          { label: "Birth Charts", href: "/charts" },
          { label: person || "Chart", href: `/charts/${chartId}` },
          { label: "Temporal" },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() =>
              fetch(`/api/charts/${chartId}/temporal?refresh=1`).then(() => refetch())
            }
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            Recompute
          </Button>
        }
      />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {isLoading && <Skeleton className="h-64 w-full rounded-card" />}
          {isError && (
            <Card className="p-5 text-sm text-ink-secondary">
              {error instanceof Error ? error.message : "Temporal data unavailable."}
            </Card>
          )}
          {data && (
            <>
              <Card className="border-accent/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">
                    The Years Ahead — generated reading
                  </h2>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={generate.isPending}
                    onClick={() => generate.mutate()}
                  >
                    {generate.isPending ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : savedReading ? (
                      "Regenerate"
                    ) : (
                      "Generate reading"
                    )}
                  </Button>
                </div>
                {generate.isError && (
                  <p className="pt-2 text-xs text-danger">
                    {generate.error instanceof Error ? generate.error.message : "Generation failed."}
                  </p>
                )}
                {generate.isPending && (
                  <p className="pt-2 text-xs text-ink-muted">
                    {genStep ?? "Writing from the grounded cycle material…"}
                  </p>
                )}
                {savedReading ? (
                  <div className="pt-4">
                    {savedReading.sections.map((section, index) => (
                      <div key={index} className="pb-4">
                        <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                          {section.heading}
                        </h3>
                        {section.paragraphs.map((paragraph, pIndex) => (
                          <p
                            key={pIndex}
                            className="pb-2.5 font-serif text-sm leading-relaxed text-ink-secondary"
                          >
                            {renderInline(paragraph)}
                          </p>
                        ))}
                      </div>
                    ))}
                    <p className="text-[10px] text-ink-faint">
                      Saved {new Date(savedReading.generatedAt).toLocaleString("en-GB")} — grounded
                      exclusively in the validated technique and vocabulary entries.
                    </p>
                  </div>
                ) : (
                  !generate.isPending && (
                    <p className="pt-2 text-xs leading-relaxed text-ink-muted">
                      One click writes the full teaching-voice reading of these cycles: your
                      Saturn return, each of the six solar years, and your inner evolution —
                      in your chart&rsquo;s language, saved with the chart.
                    </p>
                  )
                )}
              </Card>

              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Hourglass size={15} className="text-accent-hover" />
                  Saturn Return
                </h2>
                {data.grounding?.saturnReturn !== undefined && (
                  <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">
                    {data.grounding.saturnReturn}.
                  </p>
                )}
                <div className="space-y-4 pt-3">
                  {(() => {
                    const raw = data.saturnReturn.data as
                      | { previous?: unknown; next?: unknown }
                      | undefined;
                    if (data.saturnReturn.ok && raw !== undefined && ("previous" in raw || "next" in raw)) {
                      return (
                        <>
                          <div>
                            <p className="pb-1.5 text-xs font-semibold text-ink">Previous return</p>
                            {raw.previous != null ? (
                              <ResultBlock result={{ ok: true, data: raw.previous }} />
                            ) : (
                              <p className="text-xs text-ink-faint">
                                Not returned by the provider for this chart.
                              </p>
                            )}
                          </div>
                          <div className="border-t border-line/60 pt-3">
                            <p className="pb-1.5 text-xs font-semibold text-ink">Next return</p>
                            {raw.next != null ? (
                              <ResultBlock result={{ ok: true, data: raw.next }} />
                            ) : (
                              <p className="text-xs text-ink-faint">
                                Not returned by the provider for this chart.
                              </p>
                            )}
                          </div>
                        </>
                      );
                    }
                    return <ResultBlock result={data.saturnReturn} />;
                  })()}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <CalendarClock size={15} className="text-accent-hover" />
                  Solar Returns — the next six years
                </h2>
                {data.grounding?.solarReturn !== undefined && (
                  <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">
                    {data.grounding.solarReturn}.
                  </p>
                )}
                <div className="space-y-4 pt-3">
                  {data.solarReturns.map((entry) => (
                    <div key={entry.year} className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
                      <p className="pb-1.5 text-xs font-semibold text-ink">{entry.year}</p>
                      <ResultBlock result={entry} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <TrendingUp size={15} className="text-accent-hover" />
                  Secondary Progressions — where the chart is now
                </h2>
                {data.grounding?.progressions !== undefined && (
                  <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">
                    {data.grounding.progressions}.
                  </p>
                )}
                <div className="pt-3">
                  <ResultBlock result={data.progressions} />
                </div>
              </Card>

              <p className="text-[11px] text-ink-faint">
                Computed {new Date(data.generatedAt).toLocaleString("en-GB")} · anchored to
                the date of generation · cached for 7 days.
              </p>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
