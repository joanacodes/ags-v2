/**
 * Real place lookup via the Open-Meteo Geocoding API — free, no API key,
 * and it returns coordinates, elevation, country, and IANA timezone in one
 * call. The UTC offset is derived locally from the timezone via Intl.
 */

export interface GeoMatch {
  place: string;
  country: string;
  timezone: string;
  utcOffset: string;
  latitude: number;
  longitude: number;
  elevationMeters: number;
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
 * Search places by free-text query. Returns up to 5 matches, empty array
 * on short queries or network failure (the wizard treats that as
 * "no suggestions", never as an error).
 */
export async function searchPlaces(query: string): Promise<GeoMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search" +
      `?name=${encodeURIComponent(trimmed)}&count=5&language=en&format=json`;
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
        };
      });
  } catch {
    return [];
  }
}
