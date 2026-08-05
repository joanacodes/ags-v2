"use client";

import { useParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpenText,
  Braces,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChart } from "@/hooks/use-charts";
import { useAiInterpretation, useInterpretation } from "@/hooks/use-interpretation";
import type { ComposedGroup } from "@/interpretation/composer";

export default function InterpretationPage() {
  const params = useParams<{ chartId: string }>();
  const chartId = params.chartId;

  const { data: chart } = useChart(chartId);
  const { data, isLoading, isError, error, refetch } = useInterpretation(chartId);
  const ai = useAiInterpretation(chartId);

  const displayedAi = ai.data ?? data?.savedAi ?? null;

  const personName = chart
    ? `${chart.person.firstName} ${chart.person.lastName}`
    : "…";

  return (
    <AppShell>
      <PageHeader
        crumbs={[
          { label: "Birth Charts", href: "/charts" },
          { label: personName, href: `/charts/${chartId}` },
          { label: "Interpretation", accent: true },
        ]}
        title="Grammar Interpretation"
        actions={
          <Badge tone="accent">
            <Layers size={11} />
            Knowledge-grounded
          </Badge>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-w-0 space-y-6">
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {isError && (
              <ErrorState
                title="Interpretation unavailable"
                description={error instanceof Error ? error.message : "The pipeline failed."}
                onRetry={() => void refetch()}
              />
            )}

            {data && (
              <>
                {data.groups.map((group) => (
                  <GroupCard key={group.structure} group={group} />
                ))}

                {/* ---------- AI layer, strictly below the grammar ---------- */}
                <Card className="p-6">
                  <div className="flex items-start justify-between gap-4 pb-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
                        <Sparkles size={16} />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-ink">AI Interpretation</h2>
                        <p className="pt-0.5 text-xs text-ink-muted">
                          Written by AI, grounded exclusively in the composed
                          sentences above — nothing outside the grammar.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => ai.mutate()}
                      disabled={ai.isPending}
                    >
                      {ai.isPending ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Writing…
                        </>
                      ) : displayedAi !== null ? (
                        "Regenerate"
                      ) : (
                        "Generate"
                      )}
                    </Button>
                  </div>

                  {ai.isError && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft p-3.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                      <p className="text-xs leading-relaxed text-ink-secondary">
                        {ai.error instanceof Error ? ai.error.message : "Generation failed."}
                      </p>
                    </div>
                  )}

                  {displayedAi !== null && (
                    <div className="space-y-3 border-t border-line pt-4">
                      {displayedAi.text.split(/\n{2,}/).map((paragraph, index) => (
                        <p
                          key={index}
                          className="text-sm leading-relaxed text-ink-secondary"
                        >
                          {paragraph}
                        </p>
                      ))}
                      <p className="pt-1 text-[10px] uppercase tracking-wide text-ink-faint">
                        Model: {displayedAi.model} · Source: {data.knowledgePacks.join(", ")}
                        {"generatedAt" in displayedAi && typeof displayedAi.generatedAt === "string"
                          ? ` · Saved ${new Date(displayedAi.generatedAt).toLocaleString("en-GB")}`
                          : ""}
                      </p>
                    </div>
                  )}

                  {displayedAi === null && !ai.isError && !ai.isPending && (
                    <p className="border-t border-line pt-4 text-xs text-ink-faint">
                      The deterministic reading above never changes for the same
                      chart. The AI layer rewrites it as flowing prose — generated
                      once, then saved with the chart.
                    </p>
                  )}
                </Card>
              </>
            )}
          </div>

          {/* ---------------------------- rail ---------------------------- */}
          <aside className="hidden min-w-0 space-y-4 lg:block">
            <Card className="p-4">
              <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                How this works
              </p>
              <ol className="space-y-3 text-xs leading-relaxed text-ink-secondary">
                <li className="flex gap-2.5">
                  <Braces size={14} className="mt-0.5 shrink-0 text-accent-hover" />
                  Chart facts are normalized and matched against tradition-neutral
                  grammar rules.
                </li>
                <li className="flex gap-2.5">
                  <BookOpenText size={14} className="mt-0.5 shrink-0 text-accent-hover" />
                  Each match pulls its meaning from the AGS knowledge base —
                  sentences are composed, never invented.
                </li>
                <li className="flex gap-2.5">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-accent-hover" />
                  The AI rewrites those sentences as prose, and may not add
                  meanings that are not in the material.
                </li>
              </ol>
            </Card>

            {data && (
              <Card className="p-4">
                <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Pipeline
                </p>
                <dl className="space-y-2 text-xs">
                  <RailRow label="Grammar matches" value={String(data.matches.length)} />
                  <RailRow
                    label="Composed sentences"
                    value={String(data.groups.reduce((n, g) => n + g.items.length, 0))}
                  />
                  <RailRow
                    label="Diagnostics"
                    value={String(
                      data.grammarDiagnostics.length + data.compositionDiagnostics.length,
                    )}
                  />
                  <RailRow label="Knowledge pack" value={data.knowledgePacks.join(", ")} />
                </dl>
              </Card>
            )}
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function GroupCard({ group }: { group: ComposedGroup }) {
  return (
    <Card className="p-6">
      <h2 className="pb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {group.title}
      </h2>
      <ul className="space-y-3.5">
        {group.items.map((item) => (
          <li key={item.matchId} className="border-b border-line/60 pb-3.5 last:border-0 last:pb-0">
            <p className="text-xs font-semibold text-ink">{item.label}</p>
            <p className="pt-1 text-sm leading-relaxed text-ink-secondary">{item.sentence}</p>
            <p className="pt-1.5 text-[10px] text-ink-faint">
              {item.knowledgeUsed.join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
