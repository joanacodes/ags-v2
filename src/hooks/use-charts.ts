"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartService } from "@/services/chart-service";
import { notify } from "@/components/common/toaster";
import type { AiModelId } from "@/interpretation/ai-models";

export const chartKeys = {
  all: ["charts"] as const,
  list: () => [...chartKeys.all, "list"] as const,
  detail: (chartId: string) => [...chartKeys.all, "detail", chartId] as const,
  stats: () => [...chartKeys.all, "stats"] as const,
  progress: () => [...chartKeys.all, "progress"] as const,
};

export function useCharts() {
  return useQuery({ queryKey: chartKeys.list(), queryFn: ChartService.listCharts });
}

export function useChart(chartId: string) {
  return useQuery({
    queryKey: chartKeys.detail(chartId),
    queryFn: () => ChartService.getChart(chartId),
    enabled: Boolean(chartId),
  });
}

/** Readings written per chart; refreshed every few seconds while the server is writing. */
export function useChartsReadingProgress() {
  return useQuery({
    queryKey: chartKeys.progress(),
    queryFn: ChartService.getReadingProgress,
    refetchInterval: (query) => {
      const charts = Object.values(query.state.data?.charts ?? {});
      return charts.some((c) => c.queued > 0 || c.running !== null) ? 8000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

/** Record a visit when a chart page opens, so the library's "Last opened" is real. */
export function useRecordChartVisit(chartId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!chartId) return;
    ChartService.markOpened(chartId)
      .then(() => queryClient.invalidateQueries({ queryKey: chartKeys.list() }))
      .catch(() => undefined); // not worth bothering anyone about
  }, [chartId, queryClient]);
}

export function useChartLibraryStats() {
  return useQuery({ queryKey: chartKeys.stats(), queryFn: ChartService.getLibraryStats });
}

export function useToggleFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ChartService.toggleFavourite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}

export function useCreateChart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ChartService.createChart,
    onSuccess: (result) => {
      notify(
        result.persisted
          ? "Chart saved to your account."
          : "Chart created — session only (see the notice).",
        result.persisted ? "success" : "info",
      );
      queryClient.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}

export function useCalculateChart(chartId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ChartService.calculateChart(chartId),
    onSuccess: (chart) => {
      queryClient.setQueryData(chartKeys.detail(chartId), chart);
      void queryClient.invalidateQueries({ queryKey: chartKeys.list() });
    },
  });
}

export function useSetChartStatus(chartId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: "active" | "archived") => ChartService.setStatus(chartId, status),
    onSuccess: (chart) => {
      queryClient.setQueryData(chartKeys.detail(chartId), chart);
      void queryClient.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}

export function useSetChartAiModel(chartId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (aiModel: AiModelId) => ChartService.setAiModel(chartId, aiModel),
    onSuccess: (chart) => {
      queryClient.setQueryData(chartKeys.detail(chartId), chart);
      notify("AI model saved. New readings for this chart will use it.");
    },
  });
}

export function useDeleteChart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chartId: string) => ChartService.deleteChart(chartId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}
