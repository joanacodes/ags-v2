/**
 * ReportService — sole owner of report data access.
 * Reports are assembled live server-side from the chart and its generated
 * readings. Exports are real documents (PDF, Word, Markdown, text)
 * generated in the browser from the report — see `src/export`.
 */
import type { Chart, ExportFormat, Report, ReportSettings } from "@/types";
import { buildReportDocument } from "@/export/report-document";
import { downloadDocument } from "@/export/download";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const ReportService = {
  /** Save an edited section (readee corrections live with the chart). */
  async saveSectionEdit(
    chartId: string,
    sectionId: string,
    paragraphs: string[],
  ): Promise<void> {
    const response = await fetch(`/api/charts/${chartId}/report`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectionId, paragraphs }),
    });
    if (!response.ok) throw new Error(await readError(response));
  },

  async getReport(chartId: string): Promise<Report> {
    const response = await fetch(`/api/charts/${chartId}/report`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as Report;
  },

  /** Download the report as a document, or open the print dialog. */
  async exportReport(
    chart: Chart,
    report: Report,
    settings: ReportSettings,
    format: ExportFormat,
  ): Promise<{ ok: true }> {
    if (format === "print") {
      window.print();
    } else if (format === "pdf" || format === "docx" || format === "md" || format === "txt") {
      const doc = buildReportDocument(chart, report, { technicalAppendix: settings.technicalAppendix });
      if (settings.includeChartWheel && (format === "pdf" || format === "docx")) {
        const { renderWheelPng } = await import("@/export/wheel-image");
        doc.wheelImage = (await renderWheelPng(chart)) ?? undefined;
      }
      await downloadDocument(doc, format);
    }
    return { ok: true };
  },
};
