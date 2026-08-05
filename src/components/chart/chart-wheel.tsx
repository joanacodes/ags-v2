"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Aspect, Chart, ChartPoint } from "@/types";
import {
  ASPECT_GLYPHS,
  ASPECT_LABELS,
  ROMAN_NUMERALS,
  aspectTone,
  describeAspect,
  eclipticLongitude,
  pointGlyph,
  shortDegree,
} from "@/lib/astro";
import { cn } from "@/lib/utils";

type WheelLayer = "planets" | "aspects" | "houses";

type Selection =
  | { kind: "planet"; point: ChartPoint }
  | { kind: "house"; number: number }
  | { kind: "aspect"; id: string }
  | null;

const SIZE = 560;
const CENTER = SIZE / 2;
const R_OUTER = 262;
const R_ZODIAC_INNER = 234;
const R_PLANETS = 200;
const R_LABELS = 165;
const R_HOUSE_NUMERALS = 120;
const R_ASPECTS = 96;
const R_HUB = 60;

/**
 * Interactive natal wheel. No astrology calculations — positions come
 * straight from the chart's stored longitudes. Clicking a planet, house
 * segment, or aspect line highlights it and reports the selection.
 */
export function ChartWheel({ chart, className }: { chart: Chart; className?: string }) {
  const [layer, setLayer] = useState<WheelLayer>("aspects");
  const [selection, setSelection] = useState<Selection>(null);

  const ascLongitude = useMemo(() => {
    const asc = chart.angles.find((a) => a.point === "ASC");
    return asc ? eclipticLongitude(asc) : 0;
  }, [chart.angles]);

  /** Screen position for an ecliptic longitude: ASC pinned at 9 o'clock. */
  const toXY = (longitude: number, radius: number) => {
    const theta = ((180 - (longitude - ascLongitude)) * Math.PI) / 180;
    return {
      x: CENTER + radius * Math.cos(theta),
      y: CENTER + radius * Math.sin(theta),
    };
  };

  const pointLongitude = (point: ChartPoint): number | null => {
    const planet = chart.planets.find((p) => p.planet === point);
    if (planet) return eclipticLongitude(planet);
    const angle = chart.angles.find((a) => a.point === point);
    if (angle) return eclipticLongitude(angle);
    return null;
  };

  const selectedAspect: Aspect | null =
    selection?.kind === "aspect"
      ? chart.aspects.find((a) => a.id === selection.id) ?? null
      : null;

  const aspectInvolves = (aspect: Aspect, point: ChartPoint) =>
    aspect.from === point || aspect.to === point;

  const isAspectEmphasised = (aspect: Aspect) => {
    if (selection?.kind === "aspect") return aspect.id === selection.id;
    if (selection?.kind === "planet") return aspectInvolves(aspect, selection.point);
    return false;
  };

  const houseSpans = useMemo(() => {
    if (chart.houses.length !== 12) return [];
    return chart.houses.map((house, index) => {
      const next = chart.houses[(index + 1) % 12];
      const start = eclipticLongitude(house);
      let end = eclipticLongitude(next);
      if (end <= start) end += 360;
      return { number: house.number, start, end };
    });
  }, [chart.houses]);

  const describeSelection = (): string | null => {
    if (!selection) return null;
    if (selection.kind === "planet") {
      const planet = chart.planets.find((p) => p.planet === selection.point);
      if (planet) {
        return `${planet.planet} · ${shortDegree(planet)} · House ${planet.house}`;
      }
      const angle = chart.angles.find((a) => a.point === selection.point);
      return angle ? `${angle.point} · ${shortDegree(angle)}` : null;
    }
    if (selection.kind === "house") {
      const house = chart.houses.find((h) => h.number === selection.number);
      return house
        ? `House ${house.number} · cusp ${shortDegree(house)}`
        : `House ${selection.number}`;
    }
    return selectedAspect
      ? `${describeAspect(selectedAspect)} · orb ${selectedAspect.orb}`
      : null;
  };

  /** Shared props making an SVG shape clickable AND keyboard-operable. */
  const pressable = (next: Selection) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => toggleSelection(next),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSelection(next);
      }
      if (event.key === "Escape") setSelection(null);
    },
  });

  const toggleSelection = (next: Selection) => {
    setSelection((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? null : next,
    );
  };

  const donutSegmentPath = (startLon: number, endLon: number) => {
    const a = toXY(startLon, R_OUTER);
    const b = toXY(endLon, R_OUTER);
    const c = toXY(endLon, R_HUB);
    const d = toXY(startLon, R_HUB);
    const large = endLon - startLon > 180 ? 1 : 0;
    return [
      `M ${a.x} ${a.y}`,
      `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${b.x} ${b.y}`,
      `L ${c.x} ${c.y}`,
      `A ${R_HUB} ${R_HUB} 0 ${large} 0 ${d.x} ${d.y}`,
      "Z",
    ].join(" ");
  };

  const selectionLabel = describeSelection();

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink">Natal Chart Wheel</h2>
        <div className="flex items-center gap-1.5" role="group" aria-label="Wheel layer">
          {(["planets", "aspects", "houses"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={layer === option}
              onClick={() => setLayer(option)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors",
                layer === option
                  ? "border-accent/50 bg-accent-soft text-accent-hover"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink-secondary",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto mt-4 w-full max-w-[560px]">
        <motion.svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          role="group"
          aria-label={`Natal chart wheel for ${chart.person.firstName} ${chart.person.lastName}`}
        >
          {/* House segments (clickable) */}
          {houseSpans.map((span) => {
            const active = selection?.kind === "house" && selection.number === span.number;
            return (
              <path
                key={span.number}
                d={donutSegmentPath(span.start, span.end)}
                fill={
                  active
                    ? "hsl(var(--accent) / 0.14)"
                    : layer === "houses"
                      ? "hsl(var(--accent) / 0.03)"
                      : "transparent"
                }
                stroke="transparent"
                className="cursor-pointer transition-[fill] focus:outline-none focus-visible:stroke-[hsl(var(--accent))]"
                {...pressable({ kind: "house", number: span.number })}
                aria-label={`House ${span.number}`}
              />
            );
          })}

          {/* Ring frame */}
          {[R_OUTER, R_ZODIAC_INNER, R_ASPECTS + 30, R_HUB].map((r) => (
            <circle
              key={r}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke="hsl(var(--line))"
              strokeWidth={1}
            />
          ))}
          <circle cx={CENTER} cy={CENTER} r={R_HUB} fill="hsl(var(--surface-overlay) / 0.6)" />

          {/* Zodiac sign boundaries */}
          {Array.from({ length: 12 }, (_, index) => {
            const lon = index * 30;
            const a = toXY(lon, R_OUTER);
            const b = toXY(lon, R_ZODIAC_INNER);
            return (
              <line
                key={lon}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="hsl(var(--line))"
                strokeWidth={1}
              />
            );
          })}

          {/* House cusp spokes + numerals */}
          {houseSpans.map((span) => {
            const outer = toXY(span.start, R_ZODIAC_INNER);
            const inner = toXY(span.start, R_HUB);
            const mid = toXY((span.start + span.end) / 2, R_HOUSE_NUMERALS);
            const active = selection?.kind === "house" && selection.number === span.number;
            const angular = [1, 4, 7, 10].includes(span.number);
            return (
              <g key={`cusp-${span.number}`}>
                <line
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke={active ? "hsl(var(--accent) / 0.7)" : "hsl(var(--line))"}
                  strokeWidth={angular ? 1.4 : 1}
                  strokeDasharray={angular ? undefined : "3 4"}
                />
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                  fill={active ? "hsl(var(--accent-hover))" : "hsl(var(--ink-faint))"}
                  fontSize={11}
                >
                  {ROMAN_NUMERALS[span.number - 1]}
                </text>
              </g>
            );
          })}

          {/* ASC marker */}
          {(() => {
            const asc = chart.angles.find((a) => a.point === "ASC");
            if (!asc) return null;
            const lon = eclipticLongitude(asc);
            const from = toXY(lon, R_ZODIAC_INNER);
            const to = toXY(lon, R_HUB - 14);
            const label = toXY(lon, R_ZODIAC_INNER + 0);
            return (
              <g>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="hsl(var(--accent) / 0.8)"
                  strokeWidth={1.4}
                  strokeDasharray="5 4"
                />
                <text
                  x={label.x + 8}
                  y={label.y - 6}
                  fontSize={11}
                  fill="hsl(var(--accent-hover))"
                  className="pointer-events-none select-none"
                >
                  ASC {shortDegree(asc)}
                </text>
              </g>
            );
          })()}

          {/* Aspect lines */}
          {chart.aspects.map((aspect) => {
            const fromLon = pointLongitude(aspect.from);
            const toLon = pointLongitude(aspect.to);
            if (fromLon === null || toLon === null) return null;
            const a = toXY(fromLon, R_ASPECTS + 28);
            const b = toXY(toLon, R_ASPECTS + 28);
            const emphasised = isAspectEmphasised(aspect);
            const dimmed =
              (selection && !emphasised) || (layer !== "aspects" && !emphasised);
            const hard = aspectTone(aspect.type) === "hard";
            return (
              <line
                key={aspect.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  emphasised
                    ? "hsl(var(--accent-hover))"
                    : hard
                      ? "hsl(var(--danger) / 0.55)"
                      : "hsl(var(--accent) / 0.55)"
                }
                strokeWidth={emphasised ? 2 : 1.1}
                strokeOpacity={dimmed ? 0.18 : 1}
                className="cursor-pointer transition-all focus:outline-none focus-visible:stroke-[hsl(var(--accent-hover))]"
                {...pressable({ kind: "aspect", id: aspect.id })}
                aria-label={describeAspect(aspect)}
              />
            );
          })}

          {/* Planets */}
          {chart.planets.map((planet) => {
            const lon = eclipticLongitude(planet);
            const dot = toXY(lon, R_PLANETS);
            const label = toXY(lon, R_LABELS + 60);
            const active = selection?.kind === "planet" && selection.point === planet.planet;
            const linked =
              (selection?.kind === "aspect" &&
                selectedAspect &&
                aspectInvolves(selectedAspect, planet.planet)) ||
              false;
            const dimmed = Boolean(selection) && !active && !linked;
            return (
              <g
                key={planet.planet}
                className="cursor-pointer focus:outline-none focus-visible:opacity-100 [&:focus-visible_circle]:stroke-[hsl(var(--accent-hover))]"
                {...pressable({ kind: "planet", point: planet.planet })}
                aria-label={`${planet.planet} at ${shortDegree(planet)}`}
                opacity={dimmed ? 0.35 : 1}
              >
                {(active || linked) && (
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={11}
                    fill="hsl(var(--accent) / 0.18)"
                    stroke="hsl(var(--accent) / 0.6)"
                  />
                )}
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={4.5}
                  fill={
                    planet.planet === "Sun"
                      ? "hsl(var(--accent-hover))"
                      : planet.planet === "Mars"
                        ? "hsl(var(--danger) / 0.9)"
                        : planet.planet === "Venus"
                          ? "hsl(45 90% 62%)"
                          : "hsl(var(--ink-secondary))"
                  }
                  stroke="hsl(var(--surface-raised))"
                  strokeWidth={1.5}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={active ? "hsl(var(--ink))" : "hsl(var(--ink-muted))"}
                  className="pointer-events-none select-none"
                >
                  {pointGlyph(planet.planet)} {shortDegree(planet)}
                </text>
              </g>
            );
          })}
        </motion.svg>

        {/* Selection readout */}
        <div
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full border border-accent/40 bg-surface-overlay/95 px-4 py-1.5 text-xs text-ink transition-opacity",
            selectionLabel ? "opacity-100" : "opacity-0",
          )}
        >
          {selectionLabel}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-accent/70" /> Conjunction / Trine{" "}
          <span className="text-ink-faint">
            {ASPECT_GLYPHS.conjunction} {ASPECT_GLYPHS.trine}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-danger/70" /> Opposition / Square{" "}
          <span className="text-ink-faint">
            {ASPECT_GLYPHS.opposition} {ASPECT_GLYPHS.square}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded border-t border-dashed border-line-strong" /> House
          Cusps
        </span>
      </div>
      <p className="sr-only">
        {ASPECT_LABELS.conjunction} lines connect planet positions inside the wheel.
      </p>
    </div>
  );
}
