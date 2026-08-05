"use client";

/**
 * Live sky wheel: planets on the zodiac at their CURRENT positions.
 * One API snapshot (cached server-side) provides longitudes and speeds;
 * from there the wheel advances entirely on the client:
 * position(t) = absPos + speedDegPerDay * elapsedDays.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SkyBody {
  name: string;
  glyph: string;
  absPos: number;
  speedDegPerDay: number;
  retrograde: boolean;
}
interface SkySnapshot {
  fetchedAt: string;
  bodies: SkyBody[];
}

const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function useSky() {
  return useQuery({
    queryKey: ["sky"],
    queryFn: async (): Promise<SkySnapshot> => {
      const response = await fetch("/api/sky");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Sky unavailable.");
      }
      return (await response.json()) as SkySnapshot;
    },
    staleTime: 6 * 3600 * 1000, // one snapshot per session window
    retry: 1,
  });
}

/** absolute longitude -> SVG point (0° Aries at the left, counterclockwise). */
function point(cx: number, cy: number, radius: number, absPos: number) {
  const theta = ((180 - absPos) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(theta), y: cy - radius * Math.sin(theta) };
}

export function LiveSky() {
  const { data, isLoading, isError, error } = useSky();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const positions = useMemo(() => {
    if (!data) return [];
    const elapsedDays = (now - new Date(data.fetchedAt).getTime()) / 86_400_000;
    return data.bodies.map((body) => {
      const absPos =
        ((body.absPos + body.speedDegPerDay * elapsedDays) % 360 + 360) % 360;
      return { ...body, absPos };
    });
  }, [data, now]);

  const size = 300;
  const c = size / 2;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">The Sky Right Now</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Live planetary positions · advancing locally from one ephemeris snapshot
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-[10px] font-medium text-success">
          <Radio size={10} className="animate-pulse" />
          Live
        </span>
      </div>

      {isLoading && <Skeleton className="mt-4 aspect-square w-full max-w-[300px] self-center rounded-full" />}

      {isError && (
        <p className="mt-6 rounded-lg border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-ink-muted">
          {error instanceof Error ? error.message : "Sky unavailable."} The live
          wheel needs the ephemeris provider configured on the server.
        </p>
      )}

      {data && (
        <>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto mt-3 w-full max-w-[300px]"
            role="img"
            aria-label="Current positions of the planets in the zodiac"
          >
            {/* rings */}
            <circle cx={c} cy={c} r={140} fill="none" className="stroke-line" strokeWidth={1} />
            <circle cx={c} cy={c} r={112} fill="none" className="stroke-line" strokeWidth={1} />
            <circle cx={c} cy={c} r={58} fill="none" className="stroke-line/60" strokeWidth={0.75} />

            {/* sign boundaries + glyphs */}
            {SIGN_GLYPHS.map((glyph, index) => {
              const boundary = point(c, c, 140, index * 30);
              const inner = point(c, c, 112, index * 30);
              const label = point(c, c, 126, index * 30 + 15);
              return (
                <g key={glyph}>
                  <line
                    x1={inner.x}
                    y1={inner.y}
                    x2={boundary.x}
                    y2={boundary.y}
                    className="stroke-line"
                    strokeWidth={0.75}
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-ink-faint"
                    fontSize={11}
                  >
                    {glyph}
                  </text>
                </g>
              );
            })}

            {/* planets */}
            {positions.map((body, index) => {
              const radius = 88 - (index % 3) * 13; // stagger to limit overlaps
              const p = point(c, c, radius, body.absPos);
              return (
                <g key={body.name}>
                  <line
                    x1={point(c, c, 108, body.absPos).x}
                    y1={point(c, c, 108, body.absPos).y}
                    x2={point(c, c, 112, body.absPos).x}
                    y2={point(c, c, 112, body.absPos).y}
                    className="stroke-accent"
                    strokeWidth={1.5}
                  />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={13}
                    className={body.retrograde ? "fill-warning" : "fill-accent-hover"}
                  >
                    {body.glyph}
                  </text>
                </g>
              );
            })}

            {/* center clock */}
            <text x={c} y={c - 8} textAnchor="middle" fontSize={10} className="fill-ink-faint">
              {new Date(now).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </text>
            <text x={c} y={c + 8} textAnchor="middle" fontSize={13} className="fill-ink font-medium">
              {new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </text>
          </svg>

          {/* legend */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-5">
            {positions.map((body) => {
              const signIndex = Math.floor(body.absPos / 30) % 12;
              const degree = Math.floor(body.absPos % 30);
              return (
                <span key={body.name} className="flex items-center gap-1.5 text-ink-muted">
                  <span className={body.retrograde ? "text-warning" : "text-accent-hover"}>
                    {body.glyph}
                  </span>
                  <span className="truncate">
                    {degree}° {SIGN_NAMES[signIndex].slice(0, 3)}
                    {body.retrograde && " ℞"}
                  </span>
                </span>
              );
            })}
          </div>
          <p className="pt-2 text-[10px] text-ink-faint">
            Snapshot {new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC
            · positions extrapolated from ephemeris speeds — no polling.
          </p>
        </>
      )}
    </Card>
  );
}
