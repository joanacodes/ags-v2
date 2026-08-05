"use client";

import type { TechnicalAppendix as AppendixData } from "@/types";
import { Card } from "@/components/ui/card";

export function TechnicalAppendix({ appendix }: { appendix: AppendixData }) {
  return (
    <Card className="print-page p-5">
      <h2 className="text-sm font-semibold text-ink">Technical Appendix</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Planetary positions, house cusps, and aspect tables
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 print-keep">
          <h3 className="text-xs font-medium text-ink-secondary">Planetary Positions</h3>
          <table className="mt-2.5 w-full text-[11px]">
            <tbody>
              {appendix.planetaryPositions.map((row) => (
                <tr key={row.body}>
                  <td className="w-6 py-1 font-serif text-ink-muted" aria-hidden="true">
                    {row.glyph}
                  </td>
                  <td className="py-1 text-ink-muted">{row.body}</td>
                  <td className="py-1 text-right text-ink-secondary">{row.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 print-keep">
          <h3 className="text-xs font-medium text-ink-secondary">House Cusps (Placidus)</h3>
          <table className="mt-2.5 w-full text-[11px]">
            <tbody>
              {appendix.houseCusps.map((row) => (
                <tr key={row.label}>
                  <td className="py-1 text-ink-muted">{row.label}</td>
                  <td className="py-1 text-right text-ink-secondary">{row.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
