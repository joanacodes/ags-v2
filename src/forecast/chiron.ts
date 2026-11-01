/**
 * Transiting Chiron (TASK-0015). astronomy-engine computes the Sun, the Moon and the planets but not Chiron, so its
 * motion is computed here: Newton's equations for Chiron around the Sun, pulled by the eight planets (their
 * positions from astronomy-engine), integrated with the classical fourth-order Runge–Kutta method in 16-day steps
 * from one known position and velocity, and read between the steps by cubic Hermite interpolation.
 *
 * The starting state is Chiron's heliocentric position and velocity at J2000.0 (2000-01-01 12:00 TT), on the J2000
 * equator (the frame astronomy-engine calls EQJ), in AU and AU per day, read once, on 2026-11-01, from the asteroid
 * file of the Swiss Ephemeris (seas_18.se1, built on NASA JPL's DE441). That is the ephemeris FreeAstroAPI uses for
 * the natal charts, so transiting Chiron and natal Chiron agree: a Chiron return is exact when the chart says it is.
 * Only those six numbers come from it; no code or file of the Swiss Ephemeris is part of AGS.
 *
 * Checked against the same file every 5.3 days from 1900 to 2100: within 0.6″ from 1990 to 2010, 19″ from 1950 to
 * 2050, 21″ from 1925 to 2075 and 44″ at worst (1900). At Chiron's usual 0.03° to 0.1° a day, 19″ moves an exact
 * date by four hours at most; only at a station, where it hardly moves, can it be more. Checked also against dates
 * published elsewhere (see the tests): perihelion on 14 February 1996 (NASA NSSDC, Chiron fact sheet), the ingresses
 * into Aries of 2018–2019 and into Taurus of 2026–2027, and the stations of August 2026 and January 2027 (Café
 * Astrology's event pages), to within a quarter of an hour and a fraction of an arcminute.
 *
 * Outside 1900–2100 Chiron is not computed: a century further on, its orbit, which Saturn and Uranus reshape, would
 * need a fresh starting point.
 */
import * as A from "astronomy-engine";

/** The years transiting Chiron is computed for. */
export const CHIRON_FROM = Date.UTC(1900, 0, 1);
export const CHIRON_TO = Date.UTC(2101, 0, 1);

const STATE_J2000: readonly number[] = [
  -3.5295968537411793, -8.6754039151950337, -2.9359002326328576, 0.0049712298036987167, -0.0036264254578631458, -0.0008257944810170332,
];

/** Gravitational parameters in AU³/day², the DE values astronomy-engine itself uses (it does not export them). */
const SUN_GM = 0.2959122082855911e-3;
const PULLS: readonly (readonly [A.Body, number])[] = [
  [A.Body.Mercury, 0.4912547451450812e-10],
  [A.Body.Venus, 0.7243452486162703e-9],
  // the Earth with the Moon (Earth/Moon mass ratio 81.30056)
  [A.Body.Earth, 0.8887692390113509e-9 * (1 + 1 / 81.30056)],
  [A.Body.Mars, 0.9549535105779258e-10],
  [A.Body.Jupiter, 0.2825345909524226e-6],
  [A.Body.Saturn, 0.8459715185680659e-7],
  [A.Body.Uranus, 0.1292024916781969e-7],
  [A.Body.Neptune, 0.1524358900784276e-7],
];

/** Days of terrestrial time between two integration nodes: 8 gives the same orbit to within 0.1″; 32 drifts by 7″ by 1900. */
const STEP = 16;

/**
 * The astronomy-engine time for a terrestrial time (days from J2000.0). Its own AstroTime.FromTerrestrialTime can
 * loop for ever (it did at -16,384 days, in 1955: it waits for a 1e-12-day agreement that a double cannot always
 * reach that far from 2000), so the universal time is found here by a few fixed-point steps instead.
 */
function timeOfTt(tt: number): A.AstroTime {
  let ut = tt;
  for (let i = 0; i < 4; i += 1) ut += tt - new A.AstroTime(ut).tt;
  return new A.AstroTime(ut);
}

/** The planets' heliocentric positions at half-step j (terrestrial time j × STEP / 2), kept once computed. */
const planets = new Map<number, Float64Array>();
function planetsAt(j: number): Float64Array {
  let p = planets.get(j);
  if (!p) {
    const time = timeOfTt((j * STEP) / 2);
    p = new Float64Array(PULLS.length * 3);
    PULLS.forEach(([body], i) => {
      const v = A.HelioVector(body, time);
      p![3 * i] = v.x;
      p![3 * i + 1] = v.y;
      p![3 * i + 2] = v.z;
    });
    planets.set(j, p);
  }
  return p;
}

/** Position and velocity derivatives of a heliocentric state: the Sun's pull, and each planet's on Chiron less its pull on the Sun. */
function derivative(s: readonly number[], p: Float64Array): number[] {
  const r2 = s[0]! * s[0]! + s[1]! * s[1]! + s[2]! * s[2]!;
  const k = -SUN_GM / (r2 * Math.sqrt(r2));
  const a = [k * s[0]!, k * s[1]!, k * s[2]!];
  PULLS.forEach(([, gm], i) => {
    const px = p[3 * i]!;
    const py = p[3 * i + 1]!;
    const pz = p[3 * i + 2]!;
    const dx = px - s[0]!;
    const dy = py - s[1]!;
    const dz = pz - s[2]!;
    const d2 = dx * dx + dy * dy + dz * dz;
    const p2 = px * px + py * py + pz * pz;
    const kd = gm / (d2 * Math.sqrt(d2));
    const kp = gm / (p2 * Math.sqrt(p2));
    a[0] += kd * dx - kp * px;
    a[1] += kd * dy - kp * py;
    a[2] += kd * dz - kp * pz;
  });
  return [s[3]!, s[4]!, s[5]!, a[0]!, a[1]!, a[2]!];
}

/** One Runge–Kutta step from node k, forward (dir 1) or back (dir -1); the planets are taken at the step's ends and middle. */
function step(s: readonly number[], k: number, dir: 1 | -1): number[] {
  const h = dir * STEP;
  const j = 2 * k;
  const plus = (base: readonly number[], d: readonly number[], c: number) => base.map((x, i) => x + c * d[i]!);
  const k1 = derivative(s, planetsAt(j));
  const k2 = derivative(plus(s, k1, h / 2), planetsAt(j + dir));
  const k3 = derivative(plus(s, k2, h / 2), planetsAt(j + dir));
  const k4 = derivative(plus(s, k3, h), planetsAt(j + 2 * dir));
  return s.map((x, i) => x + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}

/** Integration nodes: ahead[n] at terrestrial time n × STEP, behind[n] at -n × STEP; extended only as far as asked. */
const ahead: number[][] = [[...STATE_J2000]];
const behind: number[][] = [[...STATE_J2000]];
function node(k: number): readonly number[] {
  if (k >= 0) {
    while (ahead.length <= k) ahead.push(step(ahead[ahead.length - 1]!, ahead.length - 1, 1));
    return ahead[k]!;
  }
  while (behind.length <= -k) behind.push(step(behind[behind.length - 1]!, -(behind.length - 1), -1));
  return behind[-k]!;
}

/** Chiron's heliocentric position (EQJ, AU) at a terrestrial time, in days from J2000.0. */
export function chironHeliocentric(tt: number): [number, number, number] {
  const x = tt / STEP;
  const k = Math.floor(x);
  const u = x - k;
  const a = node(k);
  const b = node(k + 1);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const at = (c: number) => h00 * a[c]! + h10 * STEP * a[c + 3]! + h01 * b[c]! + h11 * STEP * b[c + 3]!;
  return [at(0), at(1), at(2)];
}

const GRACE = 10 * 86_400_000;

/** Whether transiting Chiron is computed for every moment from one time to another (milliseconds). */
export function chironCovers(from: number, to: number): boolean {
  return from >= CHIRON_FROM && to <= CHIRON_TO;
}

/**
 * Chiron's geocentric apparent longitude, in the tropical zodiac on the true ecliptic of date, as the forecast gives
 * every other body: corrected for light-time and aberration the way astronomy-engine corrects the planets (the Earth
 * taken where it was when the light left Chiron), then turned to the ecliptic and equinox of date.
 */
export function chironLongitude(date: Date): number {
  const t = date.getTime();
  // a few days' grace at either end, for the speeds and light-times measured around the first and last moments
  if (t < CHIRON_FROM - GRACE || t > CHIRON_TO + GRACE) throw new Error("Transiting Chiron is computed from 1900 to 2100.");
  const time = A.MakeTime(date);
  let light = time;
  for (let i = 0; i < 10; i += 1) {
    const c = chironHeliocentric(light.tt);
    const earth = A.HelioVector(A.Body.Earth, light);
    const geo = new A.Vector(c[0] - earth.x, c[1] - earth.y, c[2] - earth.z, time);
    const before = time.AddDays(-geo.Length() / A.C_AUDAY);
    if (Math.abs(before.tt - light.tt) < 1e-9) {
      const lon = A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECT(time), geo)).lon;
      return ((lon % 360) + 360) % 360;
    }
    light = before;
  }
  throw new Error("Chiron: the light-time correction did not converge.");
}
