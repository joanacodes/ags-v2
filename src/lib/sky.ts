/**
 * The real sky above a place at a given moment: where each star stands
 * (altitude above the horizon, direction), and where to draw it on a
 * screen showing the whole dome above you.
 *
 * Pure functions (unit-tested). Star coordinates are J2000; precession since
 * then (~0.3°) is far below what the background needs.
 */

export const PARIS = { latitude: 48.8566, longitude: 2.3522 } as const;

const RAD = Math.PI / 180;

export function julianDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Local sidereal time in degrees (0-360) at a longitude (east positive). */
export function localSiderealDegrees(date: Date, longitude: number): number {
  const d = julianDate(date) - 2_451_545.0;
  const t = d / 36_525;
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38_710_000;
  return (((gmst + longitude) % 360) + 360) % 360;
}

/** Altitude above the horizon and azimuth (from north, through east), in degrees. */
export function altAz(
  ra: number,
  dec: number,
  latitude: number,
  lst: number,
): { alt: number; az: number } {
  const h = (lst - ra) * RAD;
  const d = dec * RAD;
  const phi = latitude * RAD;
  const sinAlt = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-Math.sin(h) * Math.cos(d), Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(h));
  return { alt: alt / RAD, az: (((az / RAD) % 360) + 360) % 360 };
}

/**
 * The dome as seen lying on your back, north at the top (so east is on the
 * left): zenith at the centre, horizon on a circle of `radius`.
 */
export function projectDome(
  alt: number,
  az: number,
  centerX: number,
  centerY: number,
  radius: number,
): { x: number; y: number } {
  // Stereographic: shapes stay true, the horizon gently widens.
  const r = radius * Math.tan(((90 - alt) * RAD) / 2);
  return { x: centerX - r * Math.sin(az * RAD), y: centerY - r * Math.cos(az * RAD) };
}

/** Galactic → J2000 equatorial rotation (rows of the equatorial → galactic matrix, Hipparcos). */
const GALACTIC = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.444829629960011, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
] as const;

/** Galactic longitude and latitude to right ascension and declination (J2000), in degrees. */
export function galacticToEquatorial(l: number, b: number): { ra: number; dec: number } {
  const gx = Math.cos(b * RAD) * Math.cos(l * RAD);
  const gy = Math.cos(b * RAD) * Math.sin(l * RAD);
  const gz = Math.sin(b * RAD);
  // The inverse of a rotation is its transpose.
  const x = GALACTIC[0][0] * gx + GALACTIC[1][0] * gy + GALACTIC[2][0] * gz;
  const y = GALACTIC[0][1] * gx + GALACTIC[1][1] * gy + GALACTIC[2][1] * gz;
  const z = GALACTIC[0][2] * gx + GALACTIC[1][2] * gy + GALACTIC[2][2] * gz;
  return {
    ra: (((Math.atan2(y, x) / RAD) % 360) + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, z))) / RAD,
  };
}

/** Star colour from its B-V index: blue-white (hot) to orange (cool). */
export function starColor(bv: number): [number, number, number] {
  if (bv < 0) return [180, 200, 255];
  if (bv < 0.3) return [215, 226, 255];
  if (bv < 0.6) return [250, 248, 240];
  if (bv < 1.0) return [255, 236, 205];
  if (bv < 1.4) return [255, 216, 170];
  return [255, 196, 140];
}

/** Drawn radius in CSS pixels from the magnitude (brighter = bigger). */
export function starRadius(mag: number): number {
  return Math.max(0.45, 2.3 - 0.36 * mag);
}
