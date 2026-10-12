"use client";

/**
 * Settings → AI prompts: read and rewrite every prompt the app sends.
 * Saved versions replace the defaults for this account only; "Reset"
 * returns to the default. The JSON output formats are shown read-only.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/common/toaster";
import { confirmDialog } from "@/components/common/confirm-dialog";
import type { PromptKey } from "@/interpretation/prompts";

interface PromptRow {
  key: PromptKey;
  label: string;
  description: string;
  placeholders: string[];
  text: string;
  defaultText: string;
  edited: boolean;
}

interface PromptsResponse {
  prompts: PromptRow[];
  fixedFormats: { reading: string; temporal: string };
  storageError: string | null;
}

const QUERY_KEY = ["settings", "prompts"];

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Request failed (${response.status})`;
}

export function PromptsEditor() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PromptsResponse> => {
      const response = await fetch("/api/settings/prompts");
      if (!response.ok) throw new Error(await readError(response));
      return (await response.json()) as PromptsResponse;
    },
  });

  if (isLoading) return <p className="text-xs text-ink-muted">Loading prompts…</p>;
  if (isError || data === undefined) return <p className="text-xs text-danger">Could not load the prompts.</p>;

  return (
    <div className="space-y-2">
      {data.storageError !== null && (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-ink">
          Saved prompts can&rsquo;t be read ({data.storageError}). The defaults are in use. Run the
          prompt_overrides migration in Supabase to enable editing.
        </p>
      )}
      {data.prompts.map((prompt) => (
        <PromptItem key={prompt.key} prompt={prompt} />
      ))}
      <details className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-ink-secondary">
          <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
          Fixed output formats (read-only)
        </summary>
        <div className="space-y-3 border-t border-line px-3 py-3">
          <p className="text-xs text-ink-muted">
            Appended after your prompts so the app can read the answer. They can&rsquo;t be edited.
          </p>
          <FixedBlock title="Readings" text={data.fixedFormats.reading} />
          <FixedBlock title="The Years Ahead" text={data.fixedFormats.temporal} />
        </div>
      </details>
    </div>
  );
}

function PromptItem({ prompt }: { prompt: PromptRow }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(prompt.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(prompt.text), [prompt.text]);

  const dirty = draft !== prompt.text;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/prompts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: prompt.key, text: draft }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      notify(`“${prompt.label}” saved.`);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: "Reset to the default prompt?",
      message: `Your version of “${prompt.label}” will be deleted.`,
      confirmLabel: "Reset",
      cancelLabel: "Keep mine",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/prompts?key=${encodeURIComponent(prompt.key)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      notify(`“${prompt.label}” is back to the default.`);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group rounded-lg border border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <ChevronRight size={13} className="shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
        <span className="flex-1 text-xs font-medium text-ink">{prompt.label}</span>
        {prompt.edited && <Badge tone="accent">Edited</Badge>}
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-3">
        <p className="text-xs text-ink-muted">{prompt.description}</p>
        {prompt.placeholders.length > 0 && (
          <p className="text-xs text-ink-muted">
            Filled in automatically:{" "}
            {prompt.placeholders.map((p) => (
              <code key={p} className="mr-1 rounded bg-surface-overlay px-1 py-0.5 text-[11px] text-ink">
                {p}
              </code>
            ))}
          </p>
        )}
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={Math.min(24, Math.max(5, draft.split("\n").length + 1))}
          className="font-mono text-xs leading-relaxed"
          aria-label={prompt.label}
          spellCheck={false}
        />
        {error !== null && <p className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy || !dirty || draft.trim() === ""}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(prompt.text)} disabled={busy}>
              Discard changes
            </Button>
          )}
          {prompt.edited && (
            <Button size="sm" variant="outline" onClick={() => void reset()} disabled={busy}>
              Reset to default
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

function FixedBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="pb-1 text-[11px] font-medium text-ink-secondary">{title}</p>
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-overlay px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">
        {text}
      </pre>
    </div>
  );
}
