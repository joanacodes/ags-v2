"use client";

/**
 * "Generate all categories" for one chart.
 *
 * Preferred: on the server. The readings are queued and a Cloudflare timer
 * writes them one at a time, so the phone can be locked or the app closed;
 * this hook only polls the progress.
 *
 * Fallback (server not set up yet): in the browser, one reading at a time,
 * surviving a phone that locks:
 *
 * - Asks the browser to keep the screen awake while it works (Screen Wake
 *   Lock), and asks again whenever the page comes back.
 * - If a reading fails while the page is hidden or offline (the phone
 *   locked, the app went to the background), it does not count as a
 *   failure: the run pauses and carries on from the same reading when the
 *   page is visible again. The list is re-read first, so a reading the
 *   server finished meanwhile is not written twice.
 * - A real error (no API key, refusal…) is retried once, then the run stops
 *   and says why.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ReadingService } from "@/services/reading-service";
import { readingKeys } from "@/hooks/use-readings";
import { getDefaultStyle, getReadingLanguage } from "@/lib/reading-prefs";

export type GenerateAllState =
  | { kind: "idle" }
  | { kind: "server"; queued: number; current: string | null }
  | { kind: "running"; done: number; total: number; current: string }
  | { kind: "paused"; done: number; total: number; current: string }
  | { kind: "finished"; total: number }
  | { kind: "error"; message: string; done: number; total: number };

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export async function requestWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    }).wakeLock;
    return wakeLock === undefined ? null : await wakeLock.request("screen");
  } catch {
    return null; // not supported, or refused (low battery mode…)
  }
}

function pageIsAway(): boolean {
  return document.visibilityState === "hidden" || !navigator.onLine;
}

/** Resolves once the page is visible and online again. */
function untilBack(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (pageIsAway()) return;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      window.clearInterval(timer);
      // Give the network a moment to come back after unlocking.
      window.setTimeout(resolve, 1200);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    const timer = window.setInterval(check, 2000);
    check();
  });
}

interface ServerSummary {
  available: boolean;
  queued: number;
  running: { slug: string; title: string } | null;
  failed: { slug: string; title: string; error: string }[];
}

async function fetchSummary(chartId: string): Promise<ServerSummary | null> {
  try {
    const response = await fetch(`/api/charts/${chartId}/jobs`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as ServerSummary) : null;
  } catch {
    return null;
  }
}

const POLL_MS = 6000;

export function useGenerateAll(chartId: string, language?: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<GenerateAllState>({ kind: "idle" });
  const runningRef = useRef(false);
  const lockRef = useRef<WakeLockSentinelLike | null>(null);

  // The wake lock is dropped by the browser when the page is hidden.
  useEffect(() => {
    const onVisible = () => {
      if (runningRef.current && document.visibilityState === "visible") {
        void requestWakeLock().then((lock) => {
          lockRef.current = lock;
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: readingKeys.list(chartId) });
    void queryClient.invalidateQueries({ queryKey: readingKeys.progress(chartId) });
    void queryClient.invalidateQueries({ queryKey: readingKeys.all });
  }, [chartId, queryClient]);

  const startInBrowser = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    lockRef.current = await requestWakeLock();
    const style = getDefaultStyle();
    const lang = language ?? getReadingLanguage();
    let total = 0;
    let done = 0;
    // Was the page hidden at any moment during the current request?
    let wentAway = false;
    const markAway = () => {
      if (pageIsAway()) wentAway = true;
    };
    document.addEventListener("visibilitychange", markAway);
    window.addEventListener("offline", markAway);
    try {
      let list = await ReadingService.listReadings(chartId);
      const queue = list.filter((r) => r.status !== "complete");
      total = queue.length;
      for (const reading of queue) {
        let attempts = 0;
        for (;;) {
          // Skip what the server already finished (e.g. before a lock).
          if (attempts > 0) {
            list = await ReadingService.listReadings(chartId).catch(() => list);
            if (list.find((r) => r.slug === reading.slug)?.status === "complete") break;
          }
          setState({ kind: "running", done, total, current: reading.shortTitle });
          wentAway = false;
          try {
            await ReadingService.regenerateReading(chartId, reading.slug, style, lang);
            break;
          } catch (error) {
            if (wentAway || pageIsAway()) {
              setState({ kind: "paused", done, total, current: reading.shortTitle });
              await untilBack();
              attempts += 1;
              continue; // an interruption, not a failure
            }
            attempts += 1;
            if (attempts >= 2) throw error;
          }
        }
        done += 1;
        refresh();
      }
      setState({ kind: "finished", total });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Generation failed.",
        done,
        total,
      });
    } finally {
      document.removeEventListener("visibilitychange", markAway);
      window.removeEventListener("offline", markAway);
      runningRef.current = false;
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      refresh();
    }
  }, [chartId, language, refresh]);

  /** Show what the server is doing; returns true while it still has work. */
  const applySummary = useCallback(
    (summary: ServerSummary | null): boolean => {
      if (summary === null || !summary.available) return false;
      const busy = summary.queued > 0 || summary.running !== null;
      if (busy) {
        setState({ kind: "server", queued: summary.queued, current: summary.running?.title ?? null });
      } else if (summary.failed.length > 0) {
        setState({
          kind: "error",
          message: summary.failed.map((f) => `${f.title}: ${f.error}`).join(" · "),
          done: 0,
          total: summary.failed.length,
        });
      } else {
        setState((current) => (current.kind === "server" ? { kind: "finished", total: 0 } : current));
      }
      return busy;
    },
    [],
  );

  // Follow the server's queue: on open, then every few seconds while busy.
  const [polling, setPolling] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchSummary(chartId).then((summary) => {
      if (!cancelled && applySummary(summary)) setPolling(true);
    });
    return () => {
      cancelled = true;
    };
  }, [chartId, applySummary]);
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const summary = await fetchSummary(chartId);
      if (cancelled) return;
      refresh();
      if (!applySummary(summary)) setPolling(false);
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [polling, chartId, applySummary, refresh]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const lang = language ?? getReadingLanguage();
    try {
      const response = await fetch(`/api/charts/${chartId}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ style: getDefaultStyle(), language: lang }),
      });
      if (response.ok) {
        const body = (await response.json()) as { summary: ServerSummary };
        if (applySummary(body.summary)) setPolling(true);
        else setState({ kind: "finished", total: 0 });
        return;
      }
      if (response.status !== 503) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setState({ kind: "error", message: body.error?.message ?? "Could not start.", done: 0, total: 0 });
        return;
      }
    } catch {
      // Offline or server unreachable: try in the browser below.
    }
    await startInBrowser();
  }, [chartId, language, applySummary, startInBrowser]);

  const stop = useCallback(async () => {
    const response = await fetch(`/api/charts/${chartId}/jobs`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) applySummary((await response.json()) as ServerSummary);
  }, [chartId, applySummary]);

  return {
    state,
    start,
    stop,
    running: state.kind === "running" || state.kind === "paused" || state.kind === "server",
  };
}
