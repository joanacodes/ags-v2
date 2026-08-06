"use client";

/** The astrologer's private comment section on a reading. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface Note {
  text: string;
  createdAt: string;
}

export function AstrologerNotes({ chartId, slug }: { chartId: string; slug: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data } = useQuery({
    queryKey: ["notes", chartId, slug],
    queryFn: async (): Promise<Note[]> => {
      const response = await fetch(`/api/charts/${chartId}/readings/${slug}/notes`);
      if (!response.ok) return [];
      const body = (await response.json()) as { notes: Note[] };
      return body.notes;
    },
  });

  const add = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch(`/api/charts/${chartId}/readings/${slug}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("Could not save the note.");
      return (await response.json()) as { notes: Note[] };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["notes", chartId, slug], result.notes);
      setDraft("");
    },
  });

  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <NotebookPen size={12} className="text-accent-hover" />
        Your comments
      </h2>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={2}
        placeholder="Observations, adjustments to make, things to verify with the readee…"
        aria-label="Add a comment on this reading"
      />
      {add.isError && (
        <p className="pt-1.5 text-xs text-danger">
          {add.error instanceof Error ? add.error.message : "Save failed."}
        </p>
      )}
      <Button
        size="sm"
        variant="primary"
        className="mt-2.5"
        disabled={add.isPending || draft.trim() === ""}
        onClick={() => add.mutate(draft)}
      >
        {add.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add comment"}
      </Button>

      {(data ?? []).length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-line pt-3.5">
          {(data ?? []).map((note, index) => (
            <li key={index}>
              <p className="text-sm leading-relaxed text-ink-secondary">{note.text}</p>
              <p className="pt-0.5 text-[10px] text-ink-faint">
                {new Date(note.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
