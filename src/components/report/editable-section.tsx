"use client";

/**
 * Wraps a report section with an inline editor: the readee's corrections
 * are saved with the chart and survive regeneration of the report view.
 */
import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";
import { ReportSectionView } from "@/components/report/report-section-view";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSaveSectionEdit } from "@/hooks/use-report";
import type { ReportSection } from "@/types";

export function EditableSection({
  section,
  chartId,
}: {
  section: ReportSection;
  chartId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const save = useSaveSectionEdit(chartId);

  if (section.status !== "complete") {
    return <ReportSectionView section={section} chartId={chartId} />;
  }

  if (!editing) {
    return (
      <div className="group relative">
        <ReportSectionView section={section} chartId={chartId} />
        <button
          type="button"
          onClick={() => {
            setDraft((section.paragraphs ?? []).join("\n\n"));
            setEditing(true);
          }}
          className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted opacity-0 transition-opacity hover:border-line-strong hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 print:hidden"
        >
          <PencilLine size={12} />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-accent/30 bg-surface-raised p-5 shadow-card">
      <p className="pb-3 text-xs font-semibold text-ink">Editing — {section.title}</p>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={Math.min(24, Math.max(8, draft.split("\n").length + 2))}
        className="font-serif text-sm leading-relaxed"
        aria-label={`Edit ${section.title}`}
      />
      <p className="pt-2 text-[11px] text-ink-faint">
        Blank line = new paragraph. Lines starting with ## stay section headings.
      </p>
      {save.isError && (
        <p className="pt-2 text-xs text-danger">
          {save.error instanceof Error ? save.error.message : "Save failed."}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              {
                sectionId: section.id,
                paragraphs: draft
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter((p) => p.length > 0),
              },
              { onSuccess: () => setEditing(false) },
            )
          }
        >
          <Check size={13} />
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X size={13} />
          Cancel
        </Button>
      </div>
    </div>
  );
}
