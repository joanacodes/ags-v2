"use client";

/**
 * Astrologer-side share card: create the readee link and copy it. The link's
 * password is the readee's birth date (dd/mm/yyyy), so nothing to invent.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/common/toaster";

interface ShareLink {
  token: string;
  created_at: string;
}

export function ShareCard({ chartId, birthDate }: { chartId: string; birthDate?: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["share-links", chartId],
    queryFn: async (): Promise<ShareLink[]> => {
      const response = await fetch(`/api/charts/${chartId}/share`);
      if (!response.ok) return [];
      const body = (await response.json()) as { links: ShareLink[] };
      return body.links;
    },
  });

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/charts/${chartId}/share`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the link.");
        return;
      }
      notify("Readee link created — copy it below.");
      void queryClient.invalidateQueries({ queryKey: ["share-links", chartId] });
    } finally {
      setCreating(false);
    }
  };

  const copy = (token: string) => {
    const url = `${window.location.origin}/r/${token}`;
    void navigator.clipboard.writeText(url).then(() => notify("Link copied to clipboard."));
  };

  return (
    <Card id="share" className="scroll-mt-6 p-4">
      <h2 className="flex items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <Link2 size={12} className="text-accent-hover" />
        Share with the readee
      </h2>
      <p className="pb-3 text-xs leading-relaxed text-ink-muted">
        They open the link with their date of birth as the password (no account),
        rate each reading, and their notes come back to you on the reading pages.
      </p>

      {(data ?? []).map((link) => (
        <div key={link.token} className="mb-2 flex items-center gap-2">
          <Input readOnly value={`/r/${link.token.slice(0, 10)}…`} className="h-8 flex-1 text-xs" />
          <Button size="sm" variant="outline" onClick={() => copy(link.token)}>
            <Copy size={12} />
            Copy
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <p className="min-w-0 flex-1 text-xs text-ink-muted">
          Password:{" "}
          <span className="font-mono font-medium text-ink">{formatPassword(birthDate)}</span>{" "}
          <span className="text-ink-faint">(dd/mm/yyyy)</span>
        </p>
        <Button size="sm" variant="primary" onClick={() => void create()} disabled={creating}>
          {creating ? <Loader2 size={12} className="animate-spin" /> : "New link"}
        </Button>
      </div>
      {error !== null && <p className="pt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}

function formatPassword(birthDate: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? "");
  return match === null ? "their birth date" : `${match[3]}/${match[2]}/${match[1]}`;
}
