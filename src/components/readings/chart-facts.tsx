"use client";

import type { Chart } from "@/types";
import { formatDegree, PLANET_GLYPHS, ASPECT_GLYPHS, ASPECT_LABELS, pointGlyph } from "@/lib/astro";
import { ordinal } from "@/lib/format";
import { Card } from "@/components/ui/card";

/**
 * Chart Facts mode: the raw, deterministic data behind the reading —
 * placements, cusps and aspects with no interpretation attached.
 */
export function ChartFacts({ chart }: { chart: Chart }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Planetary Positions</h2>
        <table className="mt-3.5 w-full text-xs">
          <tbody>
            {chart.planets.map((planet) => (
              <tr key={planet.planet} className="border-b border-line last:border-0">
                <td className="w-7 py-2 font-serif text-sm text-accent-hover" aria-hidden="true">
                  {PLANET_GLYPHS[planet.planet]}
                </td>
                <td className="py-2 text-ink-secondary">{planet.planet}</td>
                <td className="py-2 text-right text-ink">
                  {formatDegree(planet, true)}
                  {planet.retrograde && <span className="ml-1 text-warning">℞</span>}
                </td>
                <td className="w-14 py-2 text-right text-ink-muted">{ordinal(planet.house)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">
            House Cusps ({chart.configuration.houseSystem})
          </h2>
          <table className="mt-3.5 w-full text-xs">
            <tbody>
              {chart.houses.map((house) => (
                <tr key={house.number} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink-secondary">
                    {ordinal(house.number)}
                    {house.number === 1 && " (ASC)"}
                    {house.number === 4 && " (IC)"}
                    {house.number === 7 && " (DC)"}
                    {house.number === 10 && " (MC)"}
                  </td>
                  <td className="py-2 text-right text-ink">{formatDegree(house, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Aspects</h2>
          <table className="mt-3.5 w-full text-xs">
            <tbody>
              {chart.aspects.map((aspect) => (
                <tr key={aspect.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-serif text-ink-secondary" aria-hidden="true">
                    {pointGlyph(aspect.from)} {ASPECT_GLYPHS[aspect.type]} {pointGlyph(aspect.to)}
                  </td>
                  <td className="py-2 text-ink-secondary">
                    {aspect.from} {ASPECT_LABELS[aspect.type].toLowerCase()} {aspect.to}
                  </td>
                  <td className="py-2 text-right text-ink">{aspect.orb}</td>
                  <td className="w-20 py-2 text-right text-ink-muted">
                    {aspect.applying ? "applying" : "separating"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
