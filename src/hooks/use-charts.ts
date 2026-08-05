"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartService } from "@/services/chart-service";
import { notify } from "@/components/common/toaster";

export const chartKeys = {
  all: ["charts"] as const,
  list: () => [...chartKeys.all, "list"] as const,
  detail: (chartId: string) => [...chartKeys.all, "detail", chartId] as const,
  stats: () => [...chartKeys.all, "stats"] as const,
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

export function useDeleteChart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chartId: string) => ChartService.deleteChart(chartId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}
