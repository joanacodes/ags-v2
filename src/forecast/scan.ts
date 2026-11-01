/**
 * Finding contacts in time: a moving longitude sampled at regular times, its signed distance from an exact contact,
 * and from that the windows in orb and the exact moments. Shared by transits, progressions and solar arcs.
 */
export const DAY = 86_400_000;

export interface Episode {
  readonly start: number;
  readonly end: number;
  readonly exact: readonly number[];
}

/**
 * The episodes of one contact. `dist[i]` is the signed distance (degrees, -180..180) from exact at `times[i]`;
 * the orb is wider while the contact is approaching (`orbIn`) than once it is past (`orbOut`), the way a contact
 * builds before it is exact and fades after. Passes closer than `gapDays` apart (a slow planet turning back over the
 * point) make one episode. Exact moments are refined by bisection on `fine(t)`, the same distance at any time.
 */
export function episodes(times: readonly number[], dist: readonly number[], orbIn: number, orbOut: number, fine: (t: number) => number, gapDays: number): Episode[] {
  const n = times.length;
  const inOrb: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    const here = Math.abs(dist[i]!);
    const next = i + 1 < n ? Math.abs(dist[i + 1]!) : here;
    const prev = i > 0 ? Math.abs(dist[i - 1]!) : here;
    const approaching = i + 1 < n ? next < here : here < prev;
    inOrb.push(here <= (approaching ? orbIn : orbOut));
  }
  const exacts: number[] = [];
  for (let i = 0; i + 1 < n; i += 1) {
    const a = dist[i]!;
    const b = dist[i + 1]!;
    // a sample that lands on the exact point counts once, at that sample
    if (a === 0) {
      exacts.push(times[i]!);
      continue;
    }
    if (b !== 0 && Math.sign(a) !== Math.sign(b) && Math.abs(a) < 10 && Math.abs(b) < 10) {
      let lo = times[i]!;
      let hi = times[i + 1]!;
      let flo = a;
      for (let k = 0; k < 30 && hi - lo > 30_000; k += 1) {
        const mid = (lo + hi) / 2;
        const fm = fine(mid);
        if (Math.sign(fm) === Math.sign(flo)) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      exacts.push((lo + hi) / 2);
    }
  }
  const runs: { start: number; end: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!inOrb[i]) continue;
    const last = runs[runs.length - 1];
    if (last && i > 0 && inOrb[i - 1]) last.end = times[i]!;
    else runs.push({ start: times[i]!, end: times[i]! });
  }
  const merged: { start: number; end: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= gapDays * DAY) last.end = r.end;
    else merged.push({ ...r });
  }
  const step = n > 1 ? times[1]! - times[0]! : DAY;
  return merged.map((m) => ({ start: m.start, end: m.end, exact: exacts.filter((t) => t >= m.start - step && t <= m.end + step) }));
}

/** Regular sample times from one moment to another. */
export function sampleTimes(from: number, to: number, stepDays: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += stepDays * DAY) out.push(t);
  return out;
}

export const iso = (t: number): string => new Date(t).toISOString();
export const month = (t: number): string => new Date(t).toISOString().slice(0, 7);
