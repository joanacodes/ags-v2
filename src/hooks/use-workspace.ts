"use client";

import { useQuery } from "@tanstack/react-query";
import { SettingsService } from "@/services/settings-service";

export function useWorkspaceUser() {
  return useQuery({ queryKey: ["workspace", "user"], queryFn: SettingsService.getUser });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["workspace", "dashboard"],
    queryFn: SettingsService.getDashboardStats,
  });
}

export function useTransitDensity() {
  return useQuery({
    queryKey: ["workspace", "transit-density"],
    queryFn: SettingsService.getTransitDensity,
  });
}
