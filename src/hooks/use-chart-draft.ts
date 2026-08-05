"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChartDraft } from "@/types";

const DRAFT_STORAGE_KEY = "ags:chart-draft";

/**
 * Persists the Create Birth Chart wizard state locally so a draft survives
 * a page refresh. Storage access is isolated here; the wizard only sees a
 * typed draft object.
 */
export function useChartDraft() {
  const [draft, setDraft] = useState<ChartDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        setDraft(JSON.parse(raw) as ChartDraft);
      }
    } catch {
      // A malformed draft is discarded silently; the wizard starts fresh.
    } finally {
      setHydrated(true);
    }
  }, []);

  const saveDraft = useCallback((next: Omit<ChartDraft, "savedAt">) => {
    const stamped: ChartDraft = { ...next, savedAt: new Date().toISOString() };
    setDraft(stamped);
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stamped));
    } catch {
      // Storage may be unavailable (private mode); in-memory state still works.
    }
  }, []);

  const clearDraft = useCallback(() => {
    setDraft(null);
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }, []);

  return { draft, hydrated, saveDraft, clearDraft };
}
