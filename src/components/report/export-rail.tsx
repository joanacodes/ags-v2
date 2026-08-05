"use client";

import { useState } from "react";
import { FileText, Link2, Printer, Upload, FileType2, Check } from "lucide-react";
import type { ExportFormat, Report, ReportSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FORMATS: { id: ExportFormat; label: string; icon: typeof FileText; note?: string }[] = [
  { id: "pdf", label: "PDF", icon: FileType2, note: "Recommended" },
  { id: "docx", label: "DOCX", icon: FileText },
  { id: "print", label: "Print", icon: Printer },
  { id: "link", label: "Share Link", icon: Link2 },
];

/** Right rail: export options, report settings and the export summary. */
export function ExportRail({
  report,
  settings,
  onSettingsChange,
  onExport,
  exporting,
  exported,
}: {
  report: Report;
  settings: ReportSettings;
  onSettingsChange: (patch: Partial<ReportSettings>) => void;
  onExport: (format: ExportFormat) => void;
  exporting: boolean;
  exported: boolean;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");

  return (
    <aside className="space-y-6" aria-label="Export options">
      <section>
        <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Export Options
        </h2>
        <div role="radiogroup" aria-label="Export format" className="space-y-2">
          {FORMATS.map((option) => {
            const selected = format === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFormat(option.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors",
                  selected
                    ? "border-accent/50 bg-accent-soft/30 text-ink"
                    : "border-line bg-surface-raised text-ink-secondary hover:border-line-strong",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border",
                    selected ? "border-accent bg-accent" : "border-line-strong",
                  )}
                  aria-hidden="true"
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <option.icon size={15} className={selected ? "text-accent-hover" : "text-ink-muted"} />
                <span className="flex-1 font-medium">{option.label}</span>
                {option.note && <span className="text-[11px] text-accent-hover">{option.note}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-line pt-5">
        <h2 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Report Settings
        </h2>
        <div className="space-y-3.5">
          <SettingRow
            label="Include chart wheel"
            checked={settings.includeChartWheel}
            onChange={(checked) => onSettingsChange({ includeChartWheel: checked })}
          />
          <SettingRow
            label="Technical appendix"
            checked={settings.technicalAppendix}
            onChange={(checked) => onSettingsChange({ technicalAppendix: checked })}
          />
          <SettingRow
            label="Aspect tables"
            checked={settings.aspectTables}
            onChange={(checked) => onSettingsChange({ aspectTables: checked })}
          />
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-xs text-ink-muted">Cover Page Style</p>
          <Select
            value={settings.coverPageStyle}
            onChange={(event) => onSettingsChange({ coverPageStyle: event.target.value })}
            aria-label="Cover page style"
          >
            <option>Minimal Dark</option>
            <option>Classic Serif</option>
            <option>Editorial</option>
          </Select>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface-raised p-4 text-xs">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Sections ready</dt>
            <dd className="text-ink">
              {report.sectionsReady} / {report.sectionsTotal}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Estimated pages</dt>
            <dd className="text-ink">{report.estimatedPages}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Format</dt>
            <dd className="text-ink">{report.format}</dd>
          </div>
        </dl>
      </section>

      <div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => onExport(format)}
          disabled={exporting}
        >
          {exported ? <Check size={15} /> : <Upload size={15} />}
          {exporting ? "Preparing export…" : exported ? "Export ready" : "Export Now"}
        </Button>
        <p className="mt-2.5 text-center text-[11px] text-ink-muted">
          Partial export — {report.sectionsReady} of {report.sectionsTotal} sections included
        </p>
      </div>
    </aside>
  );
}

function SettingRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-secondary">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
