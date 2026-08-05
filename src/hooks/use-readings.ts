"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReadingService } from "@/services/reading-service";
import { getReadingLanguage } from "@/lib/reading-prefs";
import { notify } from "@/components/common/toaster";

function await_import_free_language(): string {
  try {
    return getReadingLanguage();
  } catch {
    return "en";
  }
}
import type { WritingStyle } from "@/types";

export const readingKeys = {
  all: ["readings"] as const,
  list: (chartId: string) => [...readingKeys.all, chartId, "list"] as const,
  detail: (chartId: string, slug: string) =>
    [...readingKeys.all, chartId, "detail", slug] as const,
  progress: (chartId: string) => [...readingKeys.all, chartId, "progress"] as const,
};

export function useReadings(chartId: string) {
  return useQuery({
    queryKey: readingKeys.list(chartId),
    queryFn: () => ReadingService.listReadings(chartId),
    enabled: Boolean(chartId),
  });
}

export function useReading(chartId: string, slug: string) {
  return useQuery({
    queryKey: readingKeys.detail(chartId, slug),
    queryFn: () => ReadingService.getReading(chartId, slug),
    enabled: Boolean(chartId && slug),
  });
}

export function useReadingProgress(chartId: string) {
  return useQuery({
    queryKey: readingKeys.progress(chartId),
    queryFn: () => ReadingService.getProgress(chartId),
    enabled: Boolean(chartId),
  });
}

export function useRegenerateReading(chartId: string, slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (style: WritingStyle) =>
      ReadingService.regenerateReading(
        chartId,
        slug,
        style,
        // Preference is browser-side; hooks always run client-side.
        (await_import_free_language()),
      ),
    onSuccess: (reading) => {
      notify(`${reading.title} reading generated.`);
      // Without this, the freshly generated reading never reached the
      // screen — the mutation succeeded but the page kept the scaffold.
      queryClient.setQueryData(readingKeys.detail(chartId, slug), reading);
      void queryClient.invalidateQueries({ queryKey: readingKeys.list(chartId) });
      void queryClient.invalidateQueries({ queryKey: readingKeys.progress(chartId) });
    },
  });
}
