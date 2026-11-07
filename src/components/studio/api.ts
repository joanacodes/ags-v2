"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

/** A JSON call to the Studio's own routes; an error comes back as an ApiError with the route's message. */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; problems?: string[] };
    if (res.status === 401) window.location.assign(`/auth/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new ApiError(d.error ?? (d.problems?.length ? d.problems.join("; ") : `the Studio answered ${res.status}`), res.status, d.problems ?? []);
  }
  return data as T;
}

/** Read a route, optionally every `refreshMs` while the tab is visible; `reload` after a change. */
export function useApi<T>(url: string | null, refreshMs?: number): { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef(url);
  current.current = url;
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      if (current.current === url) {
        setData(d);
        setError(null);
      }
    } catch (err) {
      if (current.current === url) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (current.current === url) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setLoading(true);
    void load();
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);
  return { data, error, loading, reload: load };
}
