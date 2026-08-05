"use client";

import { useMemo } from "react";
import type { Chart } from "@/types";
import { eclipticLongitude } from "@/lib/astro";

/**
 * Decorative chart thumbnail used on library cards: real planet angles from
 * the chart's data, rendered as a constellation-like miniature.
 */
export function MiniWheel({ chart, muted = false }: { chart: Chart; muted?: boolean }) {
  const points = useMemo(() => {
    const size = 200;
    const center = size / 2;
    return chart.planets.slice(0, 7).map((planet, index) => {
      const angle = ((eclipticLongitude(planet) - 90) * Math.PI) / 180;
      const radius = 40 + ((index * 17) % 42);
      return {
        key: planet.planet,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        accent: planet.planet === "Sun" || planet.planet === "Venus",
      };
    });
  }, [chart.planets]);

  const linePath = useMemo(() => {
    if (points.length < 3) return "";
    const [a, b, c] = points;
    return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z`;
  }, [points]);

  return (
    <svg
      viewBox="0 0 200 200"
      className="h-full w-full"
      aria-hidden="true"
      style={{ opacity: muted ? 0.35 : 1 }}
    >
      {[38, 60, 82].map((r) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="hsl(var(--line))"
          strokeWidth="1"
        />
      ))}
      <circle cx="100" cy="100" r="16" fill="hsl(var(--surface-overlay))" />
      {linePath && (
        <path
          d={linePath}
          fill="hsl(var(--accent) / 0.06)"
          stroke="hsl(var(--accent) / 0.45)"
          strokeWidth="1"
        />
      )}
      {points.map((point) => (
        <circle
          key={point.key}
          cx={point.x}
          cy={point.y}
          r="2.5"
          fill={point.accent ? "hsl(var(--accent-hover))" : "hsl(var(--ink-secondary))"}
        />
      ))}
    </svg>
  );
}
