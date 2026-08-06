"use client";

/**
 * Astrologer-side share card: set a password, get the readee link, copy it.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/common/toaster";

interface ShareLink {
  token: string;
  created_at: string;
}

export function ShareCard({ chartId }: { chartId: string }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the link.");
        return;
      }
      setPassword("");
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
    <Card className="p-4">
      <h2 className="flex items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <Link2 size={12} className="text-accent-hover" />
        Share with the readee
      </h2>
      <p className="pb-3 text-xs leading-relaxed text-ink-muted">
        They open the link with a password (no account), rate each reading, and
        their notes come back to you on the reading pages.
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

      <div className="flex items-end gap-2 pt-1">
        <div className="min-w-0 flex-1">
          <Label htmlFor="share-password">New link password</Label>
          <Input
            id="share-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Min. 4 characters"
            className="h-8"
          />
        </div>
        <Button size="sm" variant="primary" onClick={() => void create()} disabled={creating || password.trim().length < 4}>
          {creating ? <Loader2 size={12} className="animate-spin" /> : "Create"}
        </Button>
      </div>
      {error !== null && <p className="pt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}
