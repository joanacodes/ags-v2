/**
 * Birth-place lookup, all free and keyless:
 * - cities: Open-Meteo Geocoding (coordinates, elevation, country, timezone);
 * - full street addresses: Photon (OpenStreetMap, built for search-as-you-type);
 * - coordinates typed directly (Plus Codes, decimal degrees, DMS): decoded
 *   locally (`lib/coordinates.ts`), then named with Photon's reverse lookup.
 * Timezone and elevation for addresses and coordinates come from Open-Meteo.
 * The UTC offset is derived locally from the timezone via Intl.
 */
import {
  parseCoordinateInput,
  recoverNearest,
  decodePlusCode,
  type LatLng,
} from "./coordinates";

export interface GeoMatch {
  place: string;
  country: string;
  timezone: string;
  utcOffset: string;
  latitude: number;
  longitude: number;
  elevationMeters: number;
  /** Where the match came from (shown as a small tag in the list). */
  source?: "city" | "address" | "coordinates";
  /** Timezone and elevation still to be fetched when it is chosen. */
  needsDetails?: boolean;
}

interface OpenMeteoResult {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
}

/** "Europe/Paris" -> "UTC +2:00" (DST-aware for the current date). */
export function utcOffsetLabel(timezone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const raw = formatted.find((part) => part.type === "timeZoneName")?.value ?? "";
    // "GMT+02:00" -> "UTC +2:00" · "GMT" -> "UTC +0:00"
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match === null) return "UTC +0:00";
    return `UTC ${match[1]}${Number(match[2])}:${match[3]}`;
  } catch {
    return "UTC +0:00";
  }
}

/**
 * Search by free text: coordinates first (Plus Code, degrees), otherwise
 * cities and street addresses together. Empty array on short queries or
 * network failure (the wizard treats that as "no suggestions").
 */
export async function searchPlaces(query: string): Promise<GeoMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const coordinates = parseCoordinateInput(trimmed);
  if (coordinates.kind === "point") {
    return [await describePoint(coordinates.point, coordinates.label)];
  }
  if (coordinates.kind === "short-plus-code") {
    const [reference] = await searchCities(coordinates.locality);
    if (reference === undefined) return [];
    const full = recoverNearest(coordinates.code, reference);
    return [await describePoint(decodePlusCode(full), full)];
  }

  const [cities, addresses] = await Promise.all([searchCities(trimmed), searchAddresses(trimmed)]);
  const merged = [...cities];
  for (const address of addresses) {
    const duplicate = merged.some(
      (m) => Math.abs(m.latitude - address.latitude) < 0.01 && Math.abs(m.longitude - address.longitude) < 0.01,
    );
    if (!duplicate) merged.push(address);
  }
  return merged.slice(0, 7);
}

/** Fill in timezone and elevation for a match that still needs them. */
export async function completeMatch(match: GeoMatch): Promise<GeoMatch> {
  if (match.needsDetails !== true) return match;
  const details = await pointDetails(match);
  return { ...match, ...details, needsDetails: false };
}

/** Cities, towns and villages (Open-Meteo Geocoding). */
async function searchCities(query: string): Promise<GeoMatch[]> {
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search" +
      `?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: OpenMeteoResult[] };
    const results = data.results ?? [];
    return results
      .filter(
        (r): r is Required<Pick<OpenMeteoResult, "name" | "latitude" | "longitude">> &
          OpenMeteoResult =>
          typeof r.name === "string" &&
          typeof r.latitude === "number" &&
          typeof r.longitude === "number",
      )
      .map((r) => {
        const region = typeof r.admin1 === "string" && r.admin1 !== r.name ? `, ${r.admin1}` : "";
        const country = typeof r.country === "string" ? r.country : "";
        const timezone = typeof r.timezone === "string" ? r.timezone : "UTC";
        return {
          place: `${r.name}${region}${country !== "" ? `, ${country}` : ""}`,
          country,
          timezone,
          utcOffset: utcOffsetLabel(timezone),
          latitude: r.latitude,
          longitude: r.longitude,
          elevationMeters: typeof r.elevation === "number" ? Math.round(r.elevation) : 0,
          source: "city" as const,
        };
      });
  } catch {
    return [];
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
}

function photonLabel(p: NonNullable<PhotonFeature["properties"]>): string {
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [
    p.name !== undefined && p.name !== p.street ? p.name : undefined,
    streetLine || undefined,
    [p.postcode, p.city ?? p.district].filter(Boolean).join(" ") || undefined,
    p.state !== p.city ? p.state : undefined,
    p.country,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);
  return [...new Set(parts)].join(", ");
}

function fromPhoton(feature: PhotonFeature, source: GeoMatch["source"]): GeoMatch | null {
  const coords = feature.geometry?.coordinates;
  const props = feature.properties;
  if (coords === undefined || props === undefined) return null;
  const [longitude, latitude] = coords;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  return {
    place: photonLabel(props),
    country: props.country ?? "",
    timezone: "",
    utcOffset: "",
    latitude,
    longitude,
    elevationMeters: 0,
    source,
    needsDetails: true,
  };
}

/** Street addresses and named places (Photon / OpenStreetMap). */
async function searchAddresses(query: string): Promise<GeoMatch[]> {
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: PhotonFeature[] };
    return (data.features ?? [])
      .map((feature) => fromPhoton(feature, "address"))
      .filter((m): m is GeoMatch => m !== null && m.place.length > 0);
  } catch {
    return [];
  }
}

/** Timezone and elevation for a point (Open-Meteo). */
async function pointDetails(point: LatLng): Promise<Pick<GeoMatch, "timezone" | "utcOffset" | "elevationMeters">> {
  try {
    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${point.latitude.toFixed(5)}&longitude=${point.longitude.toFixed(5)}` +
        "&timezone=auto&forecast_days=1",
    );
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as { timezone?: string; elevation?: number };
    const timezone = typeof data.timezone === "string" && data.timezone !== "GMT" ? data.timezone : "";
    return {
      timezone,
      utcOffset: timezone !== "" ? utcOffsetLabel(timezone) : "",
      elevationMeters: typeof data.elevation === "number" ? Math.round(data.elevation) : 0,
    };
  } catch {
    // The wizard asks for the timezone by hand when it stays empty.
    return { timezone: "", utcOffset: "", elevationMeters: 0 };
  }
}

/** A typed point, named with a reverse lookup when possible. */
async function describePoint(point: LatLng, label: string): Promise<GeoMatch> {
  const [details, name] = await Promise.all([
    pointDetails(point),
    (async () => {
      try {
        const response = await fetch(
          `https://photon.komoot.io/reverse?lat=${point.latitude}&lon=${point.longitude}&limit=1`,
        );
        if (!response.ok) return null;
        const data = (await response.json()) as { features?: PhotonFeature[] };
        const first = data.features?.[0];
        return first?.properties !== undefined
          ? { place: photonLabel(first.properties), country: first.properties.country ?? "" }
          : null;
      } catch {
        return null;
      }
    })(),
  ]);
  return {
    place: name !== null && name.place !== "" ? `${name.place} (${label})` : label,
    country: name?.country ?? "",
    latitude: point.latitude,
    longitude: point.longitude,
    ...details,
    source: "coordinates",
  };
}
