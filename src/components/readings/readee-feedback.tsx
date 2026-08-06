"use client";

/** Astrologer-side view of the readee's ratings and notes for one reading. */
import { useQuery } from "@tanstack/react-query";
import { MessageSquareQuote, Star } from "lucide-react";
import { Card } from "@/components/ui/card";

interface FeedbackEntry {
  id: string;
  slug: string;
  rating: number | null;
  comment: string | null;
  author: string | null;
  quote: string | null;
  created_at: string;
}

export function ReadeeFeedback({ chartId, slug }: { chartId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ["feedback", chartId, slug],
    queryFn: async (): Promise<FeedbackEntry[]> => {
      const response = await fetch(`/api/charts/${chartId}/feedback?slug=${slug}`);
      if (!response.ok) return [];
      const body = (await response.json()) as { feedback: FeedbackEntry[] };
      return body.feedback;
    },
  });

  if (data === undefined || data.length === 0) return null;

  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <MessageSquareQuote size={12} className="text-accent-hover" />
        Readee feedback
      </h2>
      <ul className="space-y-3.5">
        {data.map((entry) => (
          <li key={entry.id} className="border-b border-line/60 pb-3.5 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              {entry.rating !== null && (
                <span className="flex gap-0.5" aria-label={`${entry.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      size={12}
                      className={
                        value <= (entry.rating ?? 0)
                          ? "fill-warning text-warning"
                          : "text-ink-faint"
                      }
                    />
                  ))}
                </span>
              )}
              <span className="text-xs text-ink-faint">
                {entry.author ?? "Anonymous"} ·{" "}
                {new Date(entry.created_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            {entry.quote !== null && (
              <blockquote className="mt-1.5 border-l-2 border-warning/60 bg-warning-soft/40 px-2.5 py-1.5 text-xs italic leading-relaxed text-ink-muted">
                “{entry.quote}”
              </blockquote>
            )}
            {entry.comment !== null && (
              <p className="pt-1.5 text-sm leading-relaxed text-ink-secondary">
                {entry.comment}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
