"use client";

/**
 * Synastry: pick two people to compare, or open a comparison made before.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCharts } from "@/hooks/use-charts";
import { useSynastryList } from "@/hooks/use-synastry";

export default function SynastryPage() {
  const router = useRouter();
  const { data: charts, isLoading } = useCharts();
  const { data: list, isLoading: listLoading } = useSynastryList();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  // Opened from a chart page: that person is already picked.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("a");
    if (preset !== null) setFirst(preset);
  }, []);

  const people = useMemo(
    () =>
      (charts ?? [])
        .filter((chart) => chart.planets.length > 0)
        .map((chart) => ({ id: chart.id, name: `${chart.person.firstName} ${chart.person.lastName}`.trim() }))
        .sort((p, q) => p.name.localeCompare(q.name)),
    [charts],
  );

  const same = first !== "" && first === second;

  return (
    <AppShell>
      <PageHeader crumbs={[{ label: "Workspace" }, { label: "Synastry", accent: true }]} title="Synastry" />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <HeartHandshake size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Compare two people</h2>
                <p className="pt-1 text-xs leading-relaxed text-ink-muted">
                  How their charts interact: attraction, the emotional bond, friction, and what
                  helps the relationship. Both charts need to be calculated.
                </p>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="mt-4 h-10 w-full" />
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="synastry-first">First person</Label>
                  <Select id="synastry-first" value={first} onChange={(e) => setFirst(e.target.value)}>
                    <option value="">Choose…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="synastry-second">Second person</Label>
                  <Select id="synastry-second" value={second} onChange={(e) => setSecond(e.target.value)}>
                    <option value="">Choose…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
            {same && <p className="pt-2 text-xs text-danger">Pick two different people.</p>}
            <Button
              variant="primary"
              className="mt-4 w-full sm:w-auto"
              disabled={first === "" || second === "" || same}
              onClick={() => router.push(`/synastry/${encodeURIComponent(first)}/${encodeURIComponent(second)}`)}
            >
              Compare
              <ArrowRight size={14} />
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Your synastries</h2>
            {listLoading ? (
              <Skeleton className="mt-3 h-12 w-full" />
            ) : (list ?? []).length === 0 ? (
              <p className="pt-1 text-xs text-ink-muted">None yet: compare two people above.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(list ?? []).map((item) => (
                  <li key={`${item.ownerChartId}|${item.partnerChartId}`}>
                    <Link
                      href={`/synastry/${encodeURIComponent(item.ownerChartId)}/${encodeURIComponent(item.partnerChartId)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-overlay"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {item.ownerName} &amp; {item.partnerName}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          {item.status === "complete" ? "Reading written" : "Reading not written yet"}
                        </span>
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
