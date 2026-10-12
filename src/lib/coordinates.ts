/**
 * Coordinates typed into the birth-place field, decoded locally (no API):
 *
 * - Plus Codes (Google Maps "Open Location Code"), full: "8J3Q3XM4+PV"
 * - Plus Codes, short + a place: "3XM4+PV Cairo" (the place is looked up
 *   separately, see `lib/geo.ts`)
 * - Decimal degrees: "48.8566, 2.3522" · "48.8566 N 2.3522 E" · "-33.86, 151.21"
 * - Degrees, minutes, seconds: 48°51'24"N 2°21'03"E
 *
 * Pure functions, unit-tested.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type CoordinateInput =
  | { kind: "point"; point: LatLng; label: string }
  | { kind: "short-plus-code"; code: string; locality: string }
  | { kind: "none" };

/* ------------------------------ Plus Codes ----------------------------- */

const ALPHABET = "23456789CFGHJMPQRVWX";
const SEPARATOR_POSITION = 8;
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];

function charIndex(c: string): number {
  return ALPHABET.indexOf(c.toUpperCase());
}

/** A full code: 8 characters, "+", then 0 or 2+ characters ("8J3Q3XM4+PV"). */
export function isFullPlusCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (!/^[23456789CFGHJMPQRVWX]{8}\+([23456789CFGHJMPQRVWX]{2,7})?$/.test(c)) return false;
  // First pair must fall inside the globe (latitude < 180, longitude < 360).
  return charIndex(c[0]) * 20 < 180 && charIndex(c[1]) * 20 < 360;
}

/** A short code (missing its first characters): "3XM4+PV", "XM4+PV". */
export function isShortPlusCode(code: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{2,6}\+[23456789CFGHJMPQRVWX]{2,7}$/i.test(code.trim()) &&
    code.trim().indexOf("+") % 2 === 0;
}

/** Centre of the area a full Plus Code describes. */
export function decodePlusCode(code: string): LatLng {
  const c = code.trim().toUpperCase().replace("+", "");
  let lat = -90;
  let lng = -180;
  let latRes = 0;
  let lngRes = 0;
  const pairDigits = Math.min(c.length, 10);
  for (let i = 0; i < pairDigits; i += 2) {
    const res = PAIR_RESOLUTIONS[i / 2];
    lat += charIndex(c[i]) * res;
    lng += charIndex(c[i + 1]) * res;
    latRes = res;
    lngRes = res;
  }
  // Characters after the 10th refine a 5 × 4 grid.
  for (let i = 10; i < c.length; i += 1) {
    const idx = charIndex(c[i]);
    latRes /= 5;
    lngRes /= 4;
    lat += Math.floor(idx / 4) * latRes;
    lng += (idx % 4) * lngRes;
  }
  return {
    latitude: Math.min(90, lat + latRes / 2),
    longitude: lng + lngRes / 2,
  };
}

/** The first `length` characters (≤ 8) of the code for a point. */
function encodePrefix(point: LatLng, length: number): string {
  let lat = Math.min(Math.max(point.latitude, -90), 90 - 1e-10) + 90;
  let lng = (((point.longitude + 180) % 360) + 360) % 360;
  let out = "";
  for (let i = 0; i < length / 2; i += 1) {
    const res = PAIR_RESOLUTIONS[i];
    const latDigit = Math.floor(lat / res);
    const lngDigit = Math.floor(lng / res);
    out += ALPHABET[latDigit] + ALPHABET[lngDigit];
    lat -= latDigit * res;
    lng -= lngDigit * res;
  }
  return out;
}

/** Turn a short code into the full code nearest to a reference point. */
export function recoverNearest(shortCode: string, reference: LatLng): string {
  const code = shortCode.trim().toUpperCase();
  const paddingLength = SEPARATOR_POSITION - code.indexOf("+");
  const resolution = Math.pow(20, 2 - paddingLength / 2);
  const half = resolution / 2;
  const candidate = decodePlusCode(encodePrefix(reference, paddingLength) + code);
  let { latitude, longitude } = candidate;
  if (reference.latitude + half < latitude && latitude - resolution >= -90) latitude -= resolution;
  else if (reference.latitude - half > latitude && latitude + resolution <= 90) latitude += resolution;
  if (reference.longitude + half < longitude) longitude -= resolution;
  else if (reference.longitude - half > longitude) longitude += resolution;
  return encodePrefix({ latitude, longitude }, paddingLength) + code;
}

/* --------------------------- Degree notations -------------------------- */

const NUMBER = String.raw`(-?\d+(?:[.,]\d+)?)`;
const PART = String.raw`${NUMBER}\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*)?`;
const LAT_LNG = new RegExp(
  String.raw`^\s*([NSns])?\s*${PART}([NSns])?\s*[,;/]?\s*([EWOew])?\s*${PART}([EWOew])?\s*$`,
);

function toNumber(raw: string | undefined): number {
  return raw === undefined ? 0 : Number(raw.replace(",", "."));
}

function combine(deg: string, min?: string, sec?: string): number {
  const d = toNumber(deg);
  const value = Math.abs(d) + toNumber(min) / 60 + toNumber(sec) / 3600;
  return d < 0 || deg.startsWith("-") ? -value : value;
}

/** "48.8566, 2.3522" or 48°51'24"N 2°21'03"E → a point, or null. */
export function parseDegrees(text: string): LatLng | null {
  // A comma inside a number is a decimal comma only when the pair is split by
  // something else (space or semicolon); "48,85 2,35" is common in Europe.
  const m = LAT_LNG.exec(text);
  if (m === null) return null;
  const [, latPre, latDeg, latMin, latSec, latPost, lngPre, lngDeg, lngMin, lngSec, lngPost] = m;
  const looksLikeCoordinates =
    /[°'′"″NSEWOnsewo]/.test(text) || /\d[.,]\d/.test(text) || /,/.test(text);
  if (!looksLikeCoordinates) return null;
  let latitude = combine(latDeg, latMin, latSec);
  let longitude = combine(lngDeg, lngMin, lngSec);
  const latHem = (latPre ?? latPost ?? "").toUpperCase();
  const lngHem = (lngPre ?? lngPost ?? "").toUpperCase();
  if (latHem === "S") latitude = -Math.abs(latitude);
  if (lngHem === "W" || lngHem === "O") longitude = -Math.abs(longitude);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/* ------------------------------- Entry --------------------------------- */

export function formatLatLng(point: LatLng): string {
  const lat = `${Math.abs(point.latitude).toFixed(5)}° ${point.latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(point.longitude).toFixed(5)}° ${point.longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}

/** Recognise coordinates of any supported kind in what was typed. */
export function parseCoordinateInput(text: string): CoordinateInput {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { kind: "none" };

  if (isFullPlusCode(trimmed)) {
    return { kind: "point", point: decodePlusCode(trimmed), label: trimmed.toUpperCase() };
  }

  // Short code followed by a place: "3XM4+PV Cairo" / "3XM4+PV, Cairo, Egypt".
  const short = /^([23456789CFGHJMPQRVWX]{2,6}\+[23456789CFGHJMPQRVWX]{2,7})[\s,]+(.{2,})$/i.exec(trimmed);
  if (short !== null && isShortPlusCode(short[1])) {
    return { kind: "short-plus-code", code: short[1].toUpperCase(), locality: short[2].trim() };
  }

  // A full code followed by a place name (Google sometimes adds one): use the code.
  const fullWithPlace = /^([23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7})[\s,]/i.exec(trimmed);
  if (fullWithPlace !== null && isFullPlusCode(fullWithPlace[1])) {
    const code = fullWithPlace[1].toUpperCase();
    return { kind: "point", point: decodePlusCode(code), label: code };
  }

  const degrees = parseDegrees(trimmed);
  if (degrees !== null) return { kind: "point", point: degrees, label: formatLatLng(degrees) };

  return { kind: "none" };
}
