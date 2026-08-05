"use client";

/**
 * Wraps a report section with an inline editor: the readee's corrections
 * are saved with the chart and survive regeneration of the report view.
 */
import { useRef, useState } from "react";
import { Bold, Check, Highlighter, Italic, PencilLine, X } from "lucide-react";
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const wrapSelection = (marker: string) => {
    const area = textareaRef.current;
    if (area === null) return;
    const { selectionStart, selectionEnd } = area;
    const selected = draft.slice(selectionStart, selectionEnd) || "text";
    const next =
      draft.slice(0, selectionStart) + marker + selected + marker + draft.slice(selectionEnd);
    setDraft(next);
    window.requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length);
    });
  };
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
          className="absolute right-0 top-9 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-ink-muted opacity-100 shadow-card transition-opacity hover:border-line-strong hover:text-ink lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100 print:hidden"
        >
          <PencilLine size={12} />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-accent/30 bg-surface-raised p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <p className="text-xs font-semibold text-ink">Editing — {section.title}</p>
        <div className="flex gap-1.5">
          <ToolButton label="Bold" onClick={() => wrapSelection("**")}>
            <Bold size={12} />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => wrapSelection("_")}>
            <Italic size={12} />
          </ToolButton>
          <ToolButton label="Highlight" onClick={() => wrapSelection("==")}>
            <Highlighter size={12} />
          </ToolButton>
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={Math.min(24, Math.max(8, draft.split("\n").length + 2))}
        className="font-serif text-sm leading-relaxed"
        aria-label={`Edit ${section.title}`}
      />
      <p className="pt-2 text-[11px] text-ink-faint">
        Blank line = new paragraph · ## heading · **bold** · _italic_ · ==highlight== (select text, then click a tool).
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


function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {children}
    </button>
  );
}
