"use client";

/**
 * Full-screen night sky: the real stars above Paris right now, placed from
 * Paris's sidereal time and slowly turning with the Earth, with the Milky
 * Way, faint constellation lines, twinkling and the odd shooting star.
 * Respects "reduce motion" (a still sky, redrawn as it turns).
 */
import { useEffect, useRef } from "react";
import {
  PARIS,
  altAz,
  galacticToEquatorial,
  localSiderealDegrees,
  projectDome,
  starColor,
  starRadius,
} from "@/lib/sky";

type CatalogStar = [ra: number, dec: number, mag: number, bv: number];

interface PlacedStar {
  x: number;
  y: number;
  r: number;
  rgb: string;
  alpha: number;
  twinkle: number;
  phase: number;
  speed: number;
  glow: boolean;
}

interface MilkyWayCell {
  ra: number;
  dec: number;
  /** How many of the five brightness steps cover it (1-5). */
  level: number;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const FRAME_MS = 1000 / 30;
const RAD = Math.PI / 180;

const SKY_BACKGROUND = "radial-gradient(ellipse at 50% 42%, #151b3d 0%, #0b0f27 50%, #04050d 100%)";

/** Thicker air near the horizon dims everything. */
function horizonFade(alt: number): number {
  return alt >= 10 ? 1 : Math.max(0, 0.35 + (0.65 * alt) / 10);
}

export function NightSky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx = context;
    const milkyWay = document.createElement("canvas");
    const mw = milkyWay.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let catalog: CatalogStar[] = [];
    let figures: [number, number][][] = [];
    let band: MilkyWayCell[] = [];
    let bandStep = 2;
    let stars: PlacedStar[] = [];
    let segments: number[] = []; // x1, y1, x2, y2, ...
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let lastPlaced = 0;
    let lastDrawn = 0;
    let dirty = true;
    let appear = reduced ? 1 : 0;
    let shooting: Shooting | null = null;
    let nextShooting = performance.now() + 4000 + Math.random() * 6000;

    const place = () => {
      const lst = localSiderealDegrees(new Date(), PARIS.longitude);
      const cx = width / 2;
      const cy = height / 2;
      // The dome's horizon circle reaches just past the screen's corners.
      const radius = (Math.hypot(width, height) / 2) * 1.04;
      const project = (ra: number, dec: number) => {
        const { alt, az } = altAz(ra, dec, PARIS.latitude, lst);
        return alt < 0 ? null : { ...projectDome(alt, az, cx, cy, radius), alt };
      };

      stars = [];
      catalog.forEach(([ra, dec, mag, bv], index) => {
        const p = project(ra, dec);
        if (p === null || p.x < -8 || p.y < -8 || p.x > width + 8 || p.y > height + 8) return;
        const [r, g, b] = starColor(bv);
        stars.push({
          x: p.x,
          y: p.y,
          r: starRadius(mag),
          rgb: `${r},${g},${b}`,
          alpha: Math.min(1, 0.3 + (5.4 - mag) / 4.2) * horizonFade(p.alt),
          twinkle: mag > 2.5 ? 0.45 : 0.2,
          // Stable per star, so twinkling doesn't jump when the sky turns.
          phase: (index * 2.39996) % (Math.PI * 2),
          speed: 0.7 + ((index * 7919) % 100) / 45,
          glow: mag < 1.6,
        });
      });

      segments = [];
      for (const figure of figures) {
        for (let i = 1; i < figure.length; i += 1) {
          const a = project(figure[i - 1][0], figure[i - 1][1]);
          const b = project(figure[i][0], figure[i][1]);
          if (a !== null && b !== null) segments.push(a.x, a.y, b.x, b.y);
        }
      }

      if (mw !== null) {
        // Drawn once per turn of the sky, then copied every frame.
        if (milkyWay.width !== Math.ceil(width) || milkyWay.height !== Math.ceil(height)) {
          milkyWay.width = Math.ceil(width);
          milkyWay.height = Math.ceil(height);
        }
        mw.clearRect(0, 0, milkyWay.width, milkyWay.height);
        for (const cell of band) {
          const p = project(cell.ra, cell.dec);
          if (p === null) continue;
          // A cell's size on screen: the projection widens toward the horizon.
          const half = ((90 - p.alt) * RAD) / 2;
          const size = (bandStep * RAD * radius) / (2 * Math.cos(half) ** 2);
          const { x, y } = p;
          // Wide, faint, overlapping blobs: the grid melts into a glow.
          const r = size * 2;
          if (x < -r || y < -r || x > width + r || y > height + r) continue;
          const a = 0.02 * cell.level * horizonFade(p.alt);
          const tint = cell.level >= 4 ? "236,226,236" : "182,196,255";
          const blob = mw.createRadialGradient(x, y, 0, x, y, r);
          blob.addColorStop(0, `rgba(${tint},${a})`);
          blob.addColorStop(1, `rgba(${tint},0)`);
          mw.fillStyle = blob;
          mw.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      lastPlaced = performance.now();
      dirty = true;
    };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      place();
    };

    const drawShooting = (dt: number) => {
      if (shooting === null) return;
      shooting.age += dt;
      shooting.x += shooting.vx * dt;
      shooting.y += shooting.vy * dt;
      const k = 1 - shooting.age / shooting.life;
      if (k <= 0) {
        shooting = null;
        nextShooting = performance.now() + 9000 + Math.random() * 16000;
        return;
      }
      const tail = 0.14; // seconds of trail
      const tx = shooting.x - shooting.vx * tail;
      const ty = shooting.y - shooting.vy * tail;
      const trail = ctx.createLinearGradient(shooting.x, shooting.y, tx, ty);
      trail.addColorStop(0, `rgba(255,255,255,${0.85 * k})`);
      trail.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(shooting.x, shooting.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDrawn < FRAME_MS) return;
      const dt = Math.min(0.1, (now - lastDrawn) / 1000);
      lastDrawn = now;
      // The sky turns a quarter of a degree a minute: re-place every few seconds.
      if (now - lastPlaced > 4000) place();
      // A still sky only needs drawing when it has turned.
      if (reduced && !dirty) return;
      dirty = false;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (catalog.length === 0) return;
      appear = Math.min(1, appear + dt / 1.6);

      if (milkyWay.width > 0) {
        ctx.globalAlpha = appear;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(milkyWay, 0, 0, milkyWay.width, milkyWay.height);
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = `rgba(150,165,255,${0.1 * appear})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < segments.length; i += 4) {
        ctx.moveTo(segments[i], segments[i + 1]);
        ctx.lineTo(segments[i + 2], segments[i + 3]);
      }
      ctx.stroke();

      const t = now / 1000;
      for (const s of stars) {
        const flicker = reduced ? 1 : 1 - s.twinkle * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        const a = s.alpha * flicker * appear;
        if (s.glow) {
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
          halo.addColorStop(0, `rgba(${s.rgb},${0.32 * a})`);
          halo.addColorStop(1, `rgba(${s.rgb},0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${s.rgb},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) {
        if (shooting === null && now > nextShooting) {
          const angle = (20 + Math.random() * 35) * RAD * (Math.random() < 0.5 ? 1 : -1);
          const speed = Math.max(width, height) * (0.7 + Math.random() * 0.4);
          shooting = {
            x: width * (0.15 + Math.random() * 0.7),
            y: height * (0.05 + Math.random() * 0.35),
            vx: Math.sin(angle) * speed,
            vy: Math.cos(angle) * speed,
            age: 0,
            life: 0.6 + Math.random() * 0.4,
          };
        }
        drawShooting(dt);
      }
    };

    void Promise.all([
      fetch("/sky/stars.json").then((r) => r.json() as Promise<{ stars: CatalogStar[] }>),
      fetch("/sky/lines.json").then((r) => r.json() as Promise<{ lines: [number, number][][] }>),
      fetch("/sky/milkyway.json").then((r) => r.json() as Promise<{ step: number; bMin: number; rows: string[] }>),
    ])
      .then(([starData, lineData, milkyWayData]) => {
        catalog = starData.stars;
        figures = lineData.lines;
        bandStep = milkyWayData.step;
        band = [];
        milkyWayData.rows.forEach((row, j) => {
          const b = milkyWayData.bMin + bandStep / 2 + j * bandStep;
          for (let i = 0; i < row.length; i += 1) {
            const level = Number(row[i]);
            if (level > 0) band.push({ ...galacticToEquatorial(bandStep / 2 + i * bandStep, b), level });
          }
        });
        place();
      })
      .catch(() => {
        /* the gradient alone still makes a night sky */
      });

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ background: SKY_BACKGROUND }}
    />
  );
}
