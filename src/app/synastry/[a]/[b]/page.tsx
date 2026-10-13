"use client";

/**
 * One synastry: the two people, the compatibility reading (written on the
 * server when background generation is set up), and the contacts between
 * the two charts that the reading is built from.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cloud, Download, Heart, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ReadingBody } from "@/components/readings/reading-body";
import { ErrorState } from "@/components/common/states";
import { confirmDialog } from "@/components/common/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { synastryKeys, useSynastry } from "@/hooks/use-synastry";
import { getDefaultStyle, getReadingLanguage } from "@/lib/reading-prefs";
import { SynastryService, type SynastryPerson } from "@/services/synastry-service";

function PersonBlock({ person }: { person: SynastryPerson }) {
  const [firstName, ...rest] = person.name.split(" ");
  return (
    <Link href={`/charts/${encodeURIComponent(person.id)}`} className="flex min-w-0 items-center gap-3 rounded-lg p-1 hover:bg-surface-overlay">
      <Avatar firstName={firstName ?? ""} lastName={rest.join(" ")} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
        <span className="block truncate text-[11px] text-ink-muted">{person.birthLine}</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {person.sun && <Badge>☉ {person.sun}</Badge>}
          {person.moon && <Badge>☽ {person.moon}</Badge>}
          {person.asc && <Badge>ASC {person.asc}</Badge>}
        </span>
      </span>
    </Link>
  );
}

export default function SynastryDetailPage() {
  const params = useParams<{ a: string; b: string }>();
  const a = decodeURIComponent(params.a);
  const b = decodeURIComponent(params.b);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useSynastry(a, b);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const job = data?.job ?? null;
  const writing = starting || job?.status === "queued" || job?.status === "running";
  const failed = !writing && job?.status === "failed";
  const reading = data?.reading ?? null;
  const pairTitle = data ? `${data.names[0]} & ${data.names[1]}` : "…";

  const write = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await SynastryService.generate(a, b, getDefaultStyle(), getReadingLanguage());
    } catch (failure) {
      setStartError(failure instanceof Error ? failure.message : "Could not write the reading.");
    } finally {
      await queryClient.invalidateQueries({ queryKey: synastryKeys.detail(a, b) });
      void queryClient.invalidateQueries({ queryKey: synastryKeys.list() });
      setStarting(false);
    }
  };

  const download = async () => {
    if (data === undefined || reading === null) return;
    setDownloading(true);
    try {
      const [{ buildSynastryDocument }, { downloadDocument }] = await Promise.all([
        import("@/export/report-document"),
        import("@/export/download"),
      ]);
      await downloadDocument(buildSynastryDocument([data.owner, data.partner], reading), "pdf");
    } finally {
      setDownloading(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Delete this synastry?",
      message: `The reading for ${pairTitle} will be deleted. Both birth charts stay.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    await SynastryService.remove(a, b);
    void queryClient.invalidateQueries({ queryKey: synastryKeys.all });
    router.push("/synastry");
  };

  return (
    <AppShell>
      <PageHeader
        crumbs={[{ label: "Synastry", href: "/synastry" }, { label: pairTitle, accent: true }]}
        title="Synastry"
        actions={
          reading !== null ? (
            <Button variant="primary" size="sm" onClick={() => void download()} disabled={downloading}>
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download PDF
            </Button>
          ) : undefined
        }
      />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {isError && (
          <ErrorState
            title="Synastry unavailable"
            description={error instanceof Error ? error.message : "This synastry couldn't be loaded."}
            onRetry={() => void refetch()}
          />
        )}
        {isLoading && (
          <div className="mx-auto max-w-3xl space-y-5">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {data !== undefined && (
          <div className="mx-auto max-w-3xl space-y-5">
            <Card className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <PersonBlock person={data.owner} />
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-hover">
                  <Heart size={15} />
                </span>
                <PersonBlock person={data.partner} />
              </div>
            </Card>

            <Card className="p-5">
              {writing && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft/50 px-3 py-2.5 text-xs leading-relaxed text-ink-secondary">
                  {job?.status === "queued" || job?.status === "running" ? (
                    <Cloud size={14} className="mt-0.5 shrink-0 text-accent-hover" />
                  ) : (
                    <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent-hover" />
                  )}
                  {job?.status === "queued"
                    ? "Starting on the server (within a minute). You can lock your phone or close the app: it keeps going."
                    : job?.status === "running"
                      ? "Writing the reading on the server, a few minutes. You can lock your phone or close the app."
                      : "Writing the reading, a few minutes. Keep this page open."}
                </p>
              )}
              {(failed || startError !== null) && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {startError ?? job?.error ?? "The reading could not be written."}
                </p>
              )}
              {reading !== null ? (
                <>
                  <ReadingBody sections={reading.sections} />
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    <Button variant="primary" size="sm" onClick={() => void download()} disabled={downloading}>
                      {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      Download PDF
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void write()} disabled={writing}>
                      <RefreshCw size={13} />
                      Rewrite
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => void remove()}>
                      <Trash2 size={13} />
                      Delete
                    </Button>
                  </div>
                </>
              ) : (
                !writing && (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-ink">The compatibility reading</p>
                    <p className="mx-auto max-w-md pt-1 text-xs leading-relaxed text-ink-muted">
                      The spark, the emotional bond, how you talk, where you live in each other&apos;s
                      chart, friction and triggers, what helps you two, and where the paths lead.
                    </p>
                    <Button
                      variant="primary"
                      className="mt-4"
                      onClick={() => void write()}
                      disabled={!data.owner.calculated || !data.partner.calculated}
                    >
                      <Sparkles size={14} />
                      {failed ? "Try again" : "Write the reading"}
                    </Button>
                    {(!data.owner.calculated || !data.partner.calculated) && (
                      <p className="pt-2 text-xs text-danger">Both charts must be calculated first.</p>
                    )}
                  </div>
                )
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">What connects your charts</h2>
              <p className="pt-1 text-xs text-ink-muted">
                The contacts between the two charts, strongest first. The reading is built from these.
              </p>
              {data.contacts.length === 0 ? (
                <p className="pt-3 text-xs text-ink-muted">No close contacts between these two charts.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {data.contacts.map((contact) => (
                    <li key={contact.label} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-14 shrink-0 font-mono text-ink-secondary">
                          {contact.glyphs.split(" ")[0]} {contact.aspectGlyph} {contact.glyphs.split(" ")[1]}
                        </span>
                        <span className="min-w-0 text-ink">{contact.label}</span>
                      </span>
                      <span className="shrink-0 text-ink-faint">{contact.orb}</span>
                    </li>
                  ))}
                </ul>
              )}
              {[
                { title: `${data.names[0]}'s planets in ${data.names[1]}'s houses`, items: data.overlays.ownerInPartner, known: data.timeKnown.partner, who: data.names[1] },
                { title: `${data.names[1]}'s planets in ${data.names[0]}'s houses`, items: data.overlays.partnerInOwner, known: data.timeKnown.owner, who: data.names[0] },
              ].map((group) => (
                <div key={group.title} className="mt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{group.title}</h3>
                  {!group.known ? (
                    <p className="pt-1 text-xs text-ink-muted">
                      {group.who}&apos;s birth time is unknown, so {group.who}&apos;s houses can&apos;t be read.
                    </p>
                  ) : group.items.length === 0 ? (
                    <p className="pt-1 text-xs text-ink-muted">{group.who}&apos;s houses aren&apos;t available in this chart.</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <li key={item.label}>
                          <Badge>{item.label.replace(/^.*?'s /, "").replace(/ in .*$/, "")} · House {item.house}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}
      </main>
    </AppShell>
  );
}
