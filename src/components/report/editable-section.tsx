"use client";

/**
 * Wraps a report section with an inline editor: the readee's corrections
 * are saved with the chart and survive regeneration of the report view.
 */
import { useEffect, useRef, useState } from "react";
import { Bold, Check, Highlighter, Italic, PencilLine, X } from "lucide-react";
import { ReportSectionView } from "@/components/report/report-section-view";
import { Button } from "@/components/ui/button";

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
  const editorRef = useRef<HTMLDivElement | null>(null);

  const exec = (command: "bold" | "italic" | "highlight") => {
    editorRef.current?.focus();
    if (command === "highlight") {
      document.execCommand("hiliteColor", false, "#f5e6c8");
    } else {
      document.execCommand(command, false);
    }
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
          <ToolButton label="Bold" onClick={() => exec("bold")}>
            <Bold size={12} />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => exec("italic")}>
            <Italic size={12} />
          </ToolButton>
          <ToolButton label="Highlight" onClick={() => exec("highlight")}>
            <Highlighter size={12} />
          </ToolButton>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`Edit ${section.title}`}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
            event.preventDefault();
            exec("bold");
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
            event.preventDefault();
            exec("italic");
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "h") {
            event.preventDefault();
            exec("highlight");
          }
        }}
        className="min-h-[220px] w-full rounded-lg border border-line bg-surface px-4 py-3 font-serif text-sm leading-relaxed text-ink-secondary outline-none focus:border-accent/50 [&_h4]:pt-2 [&_h4]:text-[11px] [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-[0.12em] [&_h4]:text-ink-muted [&_mark]:rounded-sm [&_mark]:px-0.5 [&_p]:pb-3"
        dangerouslySetInnerHTML={{ __html: markersToHtml(draft) }}
      />
      <p className="pt-2 text-[11px] text-ink-faint">
        Select text, then Ctrl+B / Ctrl+I / Ctrl+H — or tap a tool above. What you see is what prints.
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
                paragraphs: htmlToMarkers(editorRef.current),
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


/* -------- markers <-> HTML (storage stays marker-based) -------- */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markersToHtml(markers: string): string {
  return markers
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => {
      const isHeading = paragraph.startsWith("## ");
      const body = escapeHtml(isHeading ? paragraph.slice(3) : paragraph)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/==(.+?)==/g, "<mark>$1</mark>")
        .replace(/_([^_]+)_/g, "<em>$1</em>");
      return isHeading ? `<h4>${body}</h4>` : `<p>${body}</p>`;
    })
    .join("");
}

function inlineToMarkers(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const inner = Array.from(element.childNodes).map(inlineToMarkers).join("");
  const tag = element.tagName.toLowerCase();
  const style = element.getAttribute("style") ?? "";
  if (tag === "strong" || tag === "b" || /font-weight:\s*(bold|[6-9]00)/.test(style)) {
    return `**${inner}**`;
  }
  if (tag === "em" || tag === "i" || /font-style:\s*italic/.test(style)) return `_${inner}_`;
  if (tag === "mark" || /background-color/.test(style)) return `==${inner}==`;
  if (tag === "br") return "\n\n";
  return inner;
}

function htmlToMarkers(root: HTMLElement | null): string[] {
  if (root === null) return [];
  const paragraphs: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? (child as HTMLElement).tagName.toLowerCase() : "";
    const text = inlineToMarkers(child).trim();
    if (text.length === 0) continue;
    for (const piece of text.split(/\n{2,}/)) {
      const trimmed = piece.trim();
      if (trimmed.length === 0) continue;
      const fused = trimmed
        .replace(/====/g, "")
        .replace(/\*\*\*\*/g, "")
        .replace(/== +==/g, " ")
        .replace(/==\s*(.+?)\s*==/g, "==$1==");
      paragraphs.push(tag === "h4" || tag === "h3" ? `## ${fused}` : fused);
    }
  }
  return paragraphs;
}
