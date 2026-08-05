/**
 * ReportService — sole owner of report data access.
 * Reports are assembled live server-side from the chart and its generated
 * readings. PDF export goes through the browser's print dialog (real,
 * dependable, zero server rendering stack).
 */
import type { ExportFormat, Report } from "@/types";

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

  /** Print-based export: the browser produces the PDF. */
  async exportReport(_chartId: string, format: ExportFormat): Promise<{ ok: true }> {
    if (format === "pdf" || format === "print") {
      window.print();
    }
    return { ok: true };
  },
};
