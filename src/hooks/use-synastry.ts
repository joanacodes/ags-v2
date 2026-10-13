"use client";

import { useQuery } from "@tanstack/react-query";
import { SynastryService } from "@/services/synastry-service";

export const synastryKeys = {
  all: ["synastry"] as const,
  list: () => [...synastryKeys.all, "list"] as const,
  detail: (a: string, b: string) => [...synastryKeys.all, "detail", a, b] as const,
};

export function useSynastryList() {
  return useQuery({ queryKey: synastryKeys.list(), queryFn: SynastryService.list });
}

/** One couple; refreshes every few seconds while the server is writing. */
export function useSynastry(a: string, b: string) {
  return useQuery({
    queryKey: synastryKeys.detail(a, b),
    queryFn: () => SynastryService.get(a, b),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === "queued" || status === "running" ? 6000 : false;
    },
  });
}
