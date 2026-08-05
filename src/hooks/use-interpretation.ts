"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { InterpretationService } from "@/services/interpretation-service";

export function useInterpretation(chartId: string) {
  return useQuery({
    queryKey: ["interpretation", chartId],
    queryFn: () => InterpretationService.getInterpretation(chartId),
    enabled: chartId.length > 0,
    staleTime: Infinity, // deterministic: same chart -> same result
  });
}

export function useAiInterpretation(chartId: string) {
  return useMutation({
    mutationFn: () => InterpretationService.generateAiInterpretation(chartId),
  });
}
