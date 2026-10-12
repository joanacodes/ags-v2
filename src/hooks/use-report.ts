"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportService } from "@/services/report-service";
import { notify } from "@/components/common/toaster";
import { SettingsService } from "@/services/settings-service";
import type { Chart, ExportFormat, Report, ReportSettings } from "@/types";

export const reportKeys = {
  detail: (chartId: string) => ["report", chartId] as const,
  settings: () => ["report", "settings"] as const,
};

export function useReport(chartId: string) {
  return useQuery({
    queryKey: reportKeys.detail(chartId),
    queryFn: () => ReportService.getReport(chartId),
    enabled: Boolean(chartId),
  });
}

export function useReportSettings() {
  return useQuery({
    queryKey: reportKeys.settings(),
    queryFn: SettingsService.getReportSettings,
  });
}

export function useUpdateReportSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ReportSettings>) =>
      SettingsService.updateReportSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(reportKeys.settings(), settings);
    },
  });
}

export function useExportReport() {
  return useMutation({
    mutationFn: (args: { chart: Chart; report: Report; settings: ReportSettings; format: ExportFormat }) =>
      ReportService.exportReport(args.chart, args.report, args.settings, args.format),
    onError: (error) => {
      notify(error instanceof Error ? `Export failed: ${error.message}` : "Export failed.", "info");
    },
  });
}

export function useSaveSectionEdit(chartId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, paragraphs }: { sectionId: string; paragraphs: string[] }) =>
      ReportService.saveSectionEdit(chartId, sectionId, paragraphs),
    onSuccess: () => {
      notify("Section edits saved with this chart.");
      void queryClient.invalidateQueries({ queryKey: reportKeys.detail(chartId) });
    },
  });
}
