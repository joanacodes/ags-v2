"use client";

/** Share card in the readings page's side rail (wide screens). */
import { Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SharePanel } from "./share-panel";

export function ShareCard({
  chartId,
  birthDate,
  personName,
}: {
  chartId: string;
  birthDate?: string;
  personName?: string;
}) {
  return (
    <Card id="share" className="scroll-mt-6 p-4">
      <h2 className="flex items-center gap-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <Link2 size={12} className="text-accent-hover" />
        Share with the readee
      </h2>
      <SharePanel chartId={chartId} birthDate={birthDate} personName={personName} />
    </Card>
  );
}
