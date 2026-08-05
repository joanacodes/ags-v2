import type {
  Aspect,
  AspectType,
  ChartPoint,
  Element,
  Placement,
  PlanetName,
  ZodiacSign,
} from "@/types";

export const ZODIAC_SIGNS: ZodiacSign[] = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export const SIGN_ABBREVIATIONS: Record<ZodiacSign, string> = {
  Aries: "Ari",
  Taurus: "Tau",
  Gemini: "Gem",
  Cancer: "Can",
  Leo: "Leo",
  Virgo: "Vir",
  Libra: "Lib",
  Scorpio: "Sco",
  Sagittarius: "Sag",
  Capricorn: "Cap",
  Aquarius: "Aqu",
  Pisces: "Pis",
};

export const PLANET_GLYPHS: Record<PlanetName, string> = {
  Sun: "☉",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
};

export const ASPECT_GLYPHS: Record<AspectType, string> = {
  conjunction: "☌",
  sextile: "⚹",
  square: "□",
  trine: "△",
  opposition: "☍",
};

export const ASPECT_LABELS: Record<AspectType, string> = {
  conjunction: "Conjunction",
  sextile: "Sextile",
  square: "Square",
  trine: "Trine",
  opposition: "Opposition",
};

/** Harmonious aspects render in accent blue; hard aspects in the secondary hue. */
export function aspectTone(type: AspectType): "soft" | "hard" {
  return type === "square" || type === "opposition" ? "hard" : "soft";
}

export const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

/** Absolute ecliptic longitude (0–360°) of a placement. */
export function eclipticLongitude(placement: Placement): number {
  const signIndex = ZODIAC_SIGNS.indexOf(placement.sign);
  return signIndex * 30 + placement.degree + placement.minute / 60;
}

export function formatDegree(placement: Placement, withMinutes = false): string {
  if (withMinutes) {
    const minutes = String(placement.minute).padStart(2, "0");
    return `${placement.degree}°${minutes}' ${placement.sign}`;
  }
  return `${placement.degree}° ${placement.sign}`;
}

export function shortDegree(placement: Placement): string {
  return `${placement.degree}° ${SIGN_ABBREVIATIONS[placement.sign]}`;
}

export function elementColor(element: Element): string {
  switch (element) {
    case "Fire":
      return "bg-warning";
    case "Earth":
      return "bg-success";
    case "Air":
      return "bg-accent";
    case "Water":
      return "bg-accent-hover";
  }
}

export function isPlanet(point: ChartPoint): point is PlanetName {
  return point in PLANET_GLYPHS;
}

export function pointGlyph(point: ChartPoint): string {
  return isPlanet(point) ? PLANET_GLYPHS[point] : point;
}

export function describeAspect(aspect: Aspect): string {
  return `${aspect.from} ${ASPECT_LABELS[aspect.type].toLowerCase()} ${aspect.to}`;
}
